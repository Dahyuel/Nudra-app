import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { eq, and, isNull, ilike, or, sql, count, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  communityPosts,
  communityReplies,
  postVotes,
  courses,
  users,
  sessions,
  enrollments,
  subjectCommunities,
  orgMemberships,
} from '../db/schema';
import { isUserAllowedInOrganization, requireAuth, requireRole, isApprovedInstructor } from '../middleware/requireAuth';
import { generateAnonToken } from '../lib/anonToken';
import { checkAndAwardBadges } from '../lib/badges';
import { sendCommunityReplyEmail } from '../lib/mailer';
import { createNotification } from '../lib/notifications';

async function verifyCourseCommunityAccess(
  req: Request,
  userId: string,
  role: string,
  courseId: string | null
): Promise<{ allowed: boolean; status?: number; message?: string }> {
  if (!courseId) return { allowed: true };

  const [course] = await db.select({ organizationId: courses.organizationId, instructorId: courses.instructorId })
    .from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course || (req.organization ? course.organizationId !== req.organization.id : course.organizationId !== null)) {
    return { allowed: false, status: 404, message: 'Course not found' };
  }

  if (req.organization && role === 'admin') return { allowed: true };

  if (req.organization) {
    const [membership] = await db.select({ role: orgMemberships.role }).from(orgMemberships).where(and(
      eq(orgMemberships.orgId, req.organization.id), eq(orgMemberships.userId, userId),
      eq(orgMemberships.status, 'active'),
    )).limit(1);
    if (!membership) return { allowed: false, status: 403, message: 'Active organization membership is required.' };
    if (membership.role === 'organization_manager') return { allowed: true };
  }

  if (role === 'instructor' && course.instructorId === userId) {
    return { allowed: true };
  }

  const enr = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);

  if (enr.length > 0) {
    return { allowed: true };
  }

  return { allowed: false, status: 403, message: 'You must be enrolled to participate in this course community' };
}

async function postBelongsToRequestScope(
  req: Request,
  post: { courseId: string | null; subjectCommunityId: string | null },
): Promise<boolean> {
  if (post.courseId) {
    const [course] = await db.select({ organizationId: courses.organizationId }).from(courses)
      .where(eq(courses.id, post.courseId)).limit(1);
    return Boolean(course && (req.organization ? course.organizationId === req.organization.id : course.organizationId === null));
  }
  // Community-wide and subject feeds have no organization ownership field yet.
  return req.organization === undefined;
}

const MAX_CONTENT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 255;
const MAX_TAG_LENGTH = 64;
const MAX_SEARCH_LENGTH = 200;

function sanitizeContent(content: string): string {
  return content.trim().slice(0, MAX_CONTENT_LENGTH);
}

async function getCurrentUserId(req: Request): Promise<string | null> {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) return null;

  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), sql`${sessions.expiresAt} > now()`))
    .limit(1);

  return rows[0]?.userId ?? null;
}

async function getCurrentRealmUser(req: Request) {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) return null;
  const [user] = await db.select({ id: users.id, role: users.role, organizationId: users.organizationId })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), sql`${sessions.expiresAt} > now()`)).limit(1);
  return user ?? null;
}

function roomNameForPost(post: { courseId: string | null; subjectCommunityId?: string | null }) {
  if (post.courseId) return `course:${post.courseId}`;
  if (post.subjectCommunityId) return `subject:${post.subjectCommunityId}`;
  return 'community:general';
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createCommunityRouter(io: Server) {
  const router = Router();

  // GET /api/community/posts
  router.get('/posts', async (req: Request, res: Response) => {
    try {
      const courseId = (req.query.courseId as string) || null;
      const subjectCommunityId = (req.query.subjectCommunityId as string) || null;
      const search = (req.query.search as string) || '';
      const tag = (req.query.tag as string) || '';
      const currentUserId = await getCurrentUserId(req);
      const currentUser = currentUserId ? await getCurrentRealmUser(req) : null;

      if (currentUser && !(await isUserAllowedInOrganization(currentUser, req.organization))) {
        return res.status(403).json({ message: 'This account cannot access this realm.' });
      }
      if (req.organization && !courseId) {
        return res.status(404).json({ message: 'Organization community requires a course context.' });
      }
      if (courseId && !isUuid(courseId)) return res.status(400).json({ message: 'Invalid course id' });
      if (subjectCommunityId && req.organization) {
        return res.status(404).json({ message: 'Organization subject communities are not available.' });
      }

      if (subjectCommunityId && !isUuid(subjectCommunityId)) {
        return res.status(400).json({ message: 'Invalid subject community' });
      }

      if (courseId) {
        const [course] = await db.select({ organizationId: courses.organizationId }).from(courses)
          .where(eq(courses.id, courseId)).limit(1);
        if (!course || (req.organization ? course.organizationId !== req.organization.id : course.organizationId !== null)) {
          return res.status(404).json({ message: 'Course not found' });
        }
        if (!currentUser) return res.status(401).json({ message: 'Sign in to access this course community.' });
        const access = await verifyCourseCommunityAccess(req, currentUser.id, currentUser.role, courseId);
        if (!access.allowed) return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      // Three separate feeds: a course's community, a Sanaweya subject community,
      // or the general feed (posts with neither).
      const conditions = courseId
        ? [eq(communityPosts.courseId, courseId)]
        : subjectCommunityId
          ? [eq(communityPosts.subjectCommunityId, subjectCommunityId)]
          : [isNull(communityPosts.courseId), isNull(communityPosts.subjectCommunityId)];
      if (search) {
        conditions.push(
          or(
            ilike(communityPosts.title || '', `%${search}%`),
            ilike(communityPosts.content, `%${search}%`)
          )!
        );
      }
      if (tag) {
        conditions.push(eq(communityPosts.tag, tag));
      }

      const postRows = await db
        .select({
          post: communityPosts,
          authorName: users.name,
          authorAvatarUrl: users.avatarUrl,
          authorRole: users.role,
          authorInstructorStatus: users.instructorStatus,
        })
        .from(communityPosts)
        .innerJoin(users, eq(communityPosts.authorId, users.id))
        .where(and(...conditions))
        .orderBy(sql`${communityPosts.isPinned} desc, ${communityPosts.createdAt} desc`);

      const postIds = postRows.map((r) => r.post.id);

      const voteCounts = new Map<string, number>();
      const replyCounts = new Map<string, number>();
      const hasVoted = new Set<string>();

      if (postIds.length > 0) {
        const voteAgg = await db
          .select({ postId: postVotes.postId, count: count(postVotes.id) })
          .from(postVotes)
          .where(inArray(postVotes.postId, postIds))
          .groupBy(postVotes.postId);
        for (const v of voteAgg) {
          if (v.postId) voteCounts.set(v.postId, Number(v.count) || 0);
        }

        const replyAgg = await db
          .select({ postId: communityReplies.postId, count: count(communityReplies.id) })
          .from(communityReplies)
          .where(inArray(communityReplies.postId, postIds))
          .groupBy(communityReplies.postId);
        for (const r of replyAgg) {
          replyCounts.set(r.postId, Number(r.count) || 0);
        }

        if (currentUserId) {
          const votedRows = await db
            .select({ postId: postVotes.postId })
            .from(postVotes)
            .where(
              and(
                eq(postVotes.userId, currentUserId),
                inArray(postVotes.postId, postIds)
              )
            );
          for (const v of votedRows) {
            if (v.postId) hasVoted.add(v.postId);
          }
        }
      }

      const posts = postRows.map((r) => {
        const post = r.post;
        const author = post.isAnonymous
          ? {
              name: 'Anonymous',
              avatarUrl: null,
              isAnonymous: true,
              anonToken: post.anonToken,
              isInstructor: false,
            }
          : {
              name: r.authorName,
              avatarUrl: r.authorAvatarUrl,
              isAnonymous: false,
              anonToken: null,
              isInstructor: isApprovedInstructor({ role: r.authorRole, instructorStatus: r.authorInstructorStatus }),
            };

        return {
          id: post.id,
          content: post.content,
          title: post.title,
          tag: post.tag,
          isPinned: post.isPinned,
          isAnonymous: post.isAnonymous,
          createdAt: post.createdAt,
          author,
          voteCount: voteCounts.get(post.id) ?? 0,
          replyCount: replyCounts.get(post.id) ?? 0,
          hasVoted: hasVoted.has(post.id),
        };
      });

      return res.json({ posts });
    } catch (err) {
      console.error('community posts list error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // GET /api/community/posts/:postId/replies
  router.get('/posts/:postId/replies', async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      const currentUser = currentUserId ? await getCurrentRealmUser(req) : null;
      const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
      if (!post || !(await postBelongsToRequestScope(req, post))) {
        return res.status(404).json({ message: 'Post not found' });
      }
      if (currentUser && !(await isUserAllowedInOrganization(currentUser, req.organization))) {
        return res.status(403).json({ message: 'This account cannot access this realm.' });
      }
      if (post.courseId) {
        if (!currentUser) return res.status(401).json({ message: 'Sign in to access this course community.' });
        const access = await verifyCourseCommunityAccess(req, currentUser.id, currentUser.role, post.courseId);
        if (!access.allowed) return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      const replyRows = await db
        .select({
          reply: communityReplies,
          authorName: users.name,
          authorAvatarUrl: users.avatarUrl,
          authorRole: users.role,
          authorInstructorStatus: users.instructorStatus,
        })
        .from(communityReplies)
        .innerJoin(users, eq(communityReplies.authorId, users.id))
        .where(eq(communityReplies.postId, postId))
        .orderBy(communityReplies.createdAt);

      const replyIds = replyRows.map((r) => r.reply.id);

      const voteCounts = new Map<string, number>();
      const hasVoted = new Set<string>();

      if (replyIds.length > 0) {
        const voteAgg = await db
          .select({ replyId: postVotes.replyId, count: count(postVotes.id) })
          .from(postVotes)
          .where(inArray(postVotes.replyId, replyIds))
          .groupBy(postVotes.replyId);
        for (const v of voteAgg) {
          if (v.replyId) voteCounts.set(v.replyId, Number(v.count) || 0);
        }

        if (currentUserId) {
          const votedRows = await db
            .select({ replyId: postVotes.replyId })
            .from(postVotes)
            .where(
              and(
                eq(postVotes.userId, currentUserId),
                inArray(postVotes.replyId, replyIds)
              )
            );
          for (const v of votedRows) {
            if (v.replyId) hasVoted.add(v.replyId);
          }
        }
      }

      const replies = replyRows.map((r) => {
        const reply = r.reply;
        const author = reply.isAnonymous
          ? {
              name: 'Anonymous',
              avatarUrl: null,
              isAnonymous: true,
              anonToken: reply.anonToken,
              isInstructor: false,
            }
          : {
              name: r.authorName,
              avatarUrl: r.authorAvatarUrl,
              isAnonymous: false,
              anonToken: null,
              isInstructor: isApprovedInstructor({ role: r.authorRole, instructorStatus: r.authorInstructorStatus }),
            };

        return {
          id: reply.id,
          content: reply.content,
          createdAt: reply.createdAt,
          author,
          voteCount: voteCounts.get(reply.id) ?? 0,
          hasVoted: hasVoted.has(reply.id),
        };
      });

      return res.json({ replies });
    } catch (err) {
      console.error('community replies error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/community/posts
  router.post('/posts', requireAuth, async (req: Request, res: Response) => {
    try {
      const { content, title, tag, courseId, isAnonymous, subjectCommunityId } = req.body ?? {};
      const userId = req.user!.id;

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ message: 'Content is required' });
      }

      if (subjectCommunityId !== undefined && subjectCommunityId !== null) {
        if (req.organization) return res.status(404).json({ message: 'Organization subject communities are not available.' });
        if (courseId) {
          return res.status(400).json({ message: 'A post belongs to a course or a subject community, not both' });
        }
        if (!isUuid(subjectCommunityId)) {
          return res.status(400).json({ message: 'Invalid subject community' });
        }
        const community = await db
          .select({ id: subjectCommunities.id })
          .from(subjectCommunities)
          .where(eq(subjectCommunities.id, subjectCommunityId))
          .limit(1);
        if (community.length === 0) {
          return res.status(404).json({ message: 'Subject community not found' });
        }
      }

      // Anonymous identities are per feed, so posts can't be linked across feeds.
      const scopeId = courseId ?? (subjectCommunityId ? `subject:${subjectCommunityId}` : 'general');

      if (courseId && !isUuid(courseId)) return res.status(400).json({ message: 'Invalid course id' });
      if (req.organization && !courseId) return res.status(404).json({ message: 'Organization community posts require a course.' });

      const access = await verifyCourseCommunityAccess(req, userId, req.user!.role, courseId || null);
      if (!access.allowed) {
        return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      if (courseId) {
        const courseRows = await db
          .select()
          .from(courses)
          .where(and(eq(courses.id, courseId), eq(courses.isPublished, true)))
          .limit(1);
        if (courseRows.length === 0) {
          return res.status(404).json({ message: 'Course not found or not published' });
        }
      }

      const anonToken = generateAnonToken(userId, scopeId);

      const inserted = await db
        .insert(communityPosts)
        .values({
          courseId: courseId || null,
          subjectCommunityId: subjectCommunityId || null,
          authorId: userId,
          isAnonymous: !!isAnonymous,
          anonToken,
          content: sanitizeContent(content),
          title: title?.trim().slice(0, 255) || null,
          tag: tag?.trim().slice(0, 255) || null,
        })
        .returning();

      const post = inserted[0];

      const author = post.isAnonymous
        ? {
            name: 'Anonymous',
            avatarUrl: null,
            isAnonymous: true,
            anonToken: post.anonToken,
            isInstructor: false,
          }
        : {
            name: req.user!.name,
            avatarUrl: req.user!.avatarUrl,
            isAnonymous: false,
            anonToken: null,
            isInstructor: isApprovedInstructor(req.user!),
          };

      const responsePost = {
        id: post.id,
        content: post.content,
        title: post.title,
        tag: post.tag,
        isPinned: post.isPinned,
        isAnonymous: post.isAnonymous,
        createdAt: post.createdAt,
        author,
        voteCount: 0,
        replyCount: 0,
        hasVoted: false,
      };

      io.to(roomNameForPost(post)).emit('new_post', responsePost);

      return res.status(201).json({ post: responsePost });
    } catch (err) {
      console.error('create community post error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/community/posts/:postId/vote
  router.post('/posts/:postId/vote', requireAuth, async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;

      const postRows = await db.select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
      if (postRows.length === 0 || !(await postBelongsToRequestScope(req, postRows[0]))) {
        return res.status(404).json({ message: 'Post not found' });
      }
      if (postRows[0].courseId) {
        const access = await verifyCourseCommunityAccess(req, userId, req.user!.role, postRows[0].courseId);
        if (!access.allowed) return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      const existing = await db
        .select()
        .from(postVotes)
        .where(and(eq(postVotes.userId, userId), eq(postVotes.postId, postId)))
        .limit(1);

      let voted: boolean;

      if (existing.length > 0) {
        await db
          .delete(postVotes)
          .where(and(eq(postVotes.userId, userId), eq(postVotes.postId, postId)));
        voted = false;
      } else {
        await db.insert(postVotes).values({ userId, postId });
        voted = true;
      }

      const voteAgg = await db
        .select({ count: count(postVotes.id) })
        .from(postVotes)
        .where(eq(postVotes.postId, postId));

      return res.json({ voted, voteCount: Number(voteAgg[0]?.count || 0) });
    } catch (err) {
      console.error('community post vote error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/community/posts/:postId/pin
  router.post('/posts/:postId/pin', requireAuth, requireRole('instructor'), async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const userId = req.user!.id;

      const postRows = await db.select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
      if (postRows.length === 0 || !(await postBelongsToRequestScope(req, postRows[0]))) {
        return res.status(404).json({ message: 'Post not found' });
      }

      const post = postRows[0];

      if (post.courseId) {
        const courseRows = await db.select().from(courses).where(eq(courses.id, post.courseId)).limit(1);
        if (courseRows.length === 0) {
          return res.status(404).json({ message: 'Course not found' });
        }
        const access = await verifyCourseCommunityAccess(req, userId, req.user!.role, post.courseId);
        if (!access.allowed) return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
        if (courseRows[0].instructorId !== userId) {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }

      const updated = await db
        .update(communityPosts)
        .set({ isPinned: !post.isPinned })
        .where(eq(communityPosts.id, postId))
        .returning();

      return res.json({ isPinned: updated[0].isPinned });
    } catch (err) {
      console.error('community post pin error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/community/posts/:postId/replies
  router.post('/posts/:postId/replies', requireAuth, async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      const { content, isAnonymous } = req.body ?? {};
      const userId = req.user!.id;

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ message: 'Content is required' });
      }

      const postRows = await db.select().from(communityPosts).where(eq(communityPosts.id, postId)).limit(1);
      if (postRows.length === 0 || !(await postBelongsToRequestScope(req, postRows[0]))) {
        return res.status(404).json({ message: 'Post not found' });
      }

      const post = postRows[0];
      const scopeId = post.courseId ?? (post.subjectCommunityId ? `subject:${post.subjectCommunityId}` : 'general');

      const access = await verifyCourseCommunityAccess(req, userId, req.user!.role, post.courseId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      const anonToken = generateAnonToken(userId, scopeId);

      const inserted = await db
        .insert(communityReplies)
        .values({
          postId,
          authorId: userId,
          isAnonymous: !!isAnonymous,
          anonToken,
          content: sanitizeContent(content),
        })
        .returning();

      const reply = inserted[0];

      const author = reply.isAnonymous
        ? {
            name: 'Anonymous',
            avatarUrl: null,
            isAnonymous: true,
            anonToken: reply.anonToken,
            isInstructor: false,
          }
        : {
            name: req.user!.name,
            avatarUrl: req.user!.avatarUrl,
            isAnonymous: false,
            anonToken: null,
            isInstructor: isApprovedInstructor(req.user!),
          };

      const responseReply = {
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt,
        author,
        voteCount: 0,
        hasVoted: false,
      };

      io.to(roomNameForPost(post)).emit(`new_reply:${postId}`, responseReply);

      if (!post.isAnonymous && post.authorId !== userId) {
        const authorRows = await db
          .select({ name: users.name, email: users.email, notifyCommunity: users.notifyCommunity })
          .from(users)
          .where(eq(users.id, post.authorId))
          .limit(1);
        // "Community Discussion Alerts" in Settings turns both the email and the
        // in-app notification off.
        if (authorRows.length > 0 && authorRows[0].notifyCommunity) {
          sendCommunityReplyEmail(authorRows[0], {
            title: post.title ?? 'منشورك',
            courseId: post.courseId,
          }).catch(console.warn);
          createNotification(
            post.authorId,
            'community_reply',
            'رد جديد على سؤالك',
            'رد شخص ما على منشورك',
            post.courseId
              ? `/course/${post.courseId}/community?post=${post.id}`
              : post.subjectCommunityId
                ? `/community?community=${post.subjectCommunityId}`
                : '/community'
          ).catch(console.warn);
        }
      }

      await checkAndAwardBadges(userId);

      return res.status(201).json({ reply: responseReply });
    } catch (err) {
      console.error('create community reply error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // POST /api/community/replies/:replyId/vote
  router.post('/replies/:replyId/vote', requireAuth, async (req: Request, res: Response) => {
    try {
      const { replyId } = req.params;
      const userId = req.user!.id;

      const replyRows = await db
        .select()
        .from(communityReplies)
        .where(eq(communityReplies.id, replyId))
        .limit(1);
      if (replyRows.length === 0) {
        return res.status(404).json({ message: 'Reply not found' });
      }
      const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, replyRows[0].postId)).limit(1);
      if (!post || !(await postBelongsToRequestScope(req, post))) {
        return res.status(404).json({ message: 'Reply not found' });
      }
      if (post.courseId) {
        const access = await verifyCourseCommunityAccess(req, userId, req.user!.role, post.courseId);
        if (!access.allowed) return res.status(access.status || 403).json({ message: access.message || 'Access denied' });
      }

      const existing = await db
        .select()
        .from(postVotes)
        .where(and(eq(postVotes.userId, userId), eq(postVotes.replyId, replyId)))
        .limit(1);

      let voted: boolean;

      if (existing.length > 0) {
        await db
          .delete(postVotes)
          .where(and(eq(postVotes.userId, userId), eq(postVotes.replyId, replyId)));
        voted = false;
      } else {
        await db.insert(postVotes).values({ userId, replyId });
        voted = true;
      }

      const voteAgg = await db
        .select({ count: count(postVotes.id) })
        .from(postVotes)
        .where(eq(postVotes.replyId, replyId));

      return res.json({ voted, voteCount: Number(voteAgg[0]?.count || 0) });
    } catch (err) {
      console.error('community reply vote error', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
}
