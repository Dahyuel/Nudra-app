import { Router, Request, Response } from 'express';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { catalogItems, courseCatalogItems, courses } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/requireAuth';

const publicRouter = Router();
const adminRouter = Router();
const trackSchema = z.enum(['general', 'school', 'university']);
const kindSchema = z.enum([
  'general_field', 'specialization', 'curriculum', 'stage', 'qualification',
  'grade', 'subject', 'syllabus_version', 'university', 'faculty', 'program', 'module',
]);
const itemInput = z.object({
  track: trackSchema,
  kind: kindSchema,
  parentId: z.string().uuid().nullable().optional(),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameEn: z.string().trim().min(1).max(255),
  nameAr: z.string().trim().max(255).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(100000).optional(),
  isVisible: z.boolean().optional(),
  provenance: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const patchInput = itemInput.partial().extend({ parentId: z.string().uuid().nullable().optional() });
const idSchema = z.string().uuid();
const courseAssociationInput = z.object({ catalogItemIds: z.array(idSchema).max(30) });
const importItem = itemInput.extend({
  parentSlug: z.string().trim().min(1).max(160).optional(),
  parentParentSlug: z.string().trim().min(1).max(160).optional(),
});
const importInput = z.object({ items: z.array(importItem).min(1).max(1000) });

type Track = z.infer<typeof trackSchema>;
type Kind = z.infer<typeof kindSchema>;
type PublicCourse = {
  id: string; title: string; titleAr: string | null; subtitle: string | null; category: string;
  level: string; price: string; durationText: string | null; thumbnailUrl: string | null;
  sanaweyaGrade: string | null; sanaweyaSubject: string | null;
};

const validParentKinds: Record<Track, Partial<Record<Kind, Kind[]>>> = {
  general: { general_field: [], specialization: ['general_field', 'specialization'] },
  school: {
    curriculum: [], stage: ['curriculum'], qualification: ['stage'], grade: ['qualification'],
    subject: ['grade'], syllabus_version: ['subject'],
  },
  university: { university: [], faculty: ['university'], program: ['faculty'], module: ['program'] },
};

function publicItem(row: typeof catalogItems.$inferSelect) {
  return {
    id: row.id,
    track: row.track,
    kind: row.kind,
    parentId: row.parentId,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    description: row.description,
    displayOrder: row.displayOrder,
    provenance: row.provenance,
  };
}

async function visibleTree(itemId: string): Promise<boolean> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, is_visible, archived_at FROM public.catalog_items WHERE id = ${itemId}::uuid
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.is_visible, parent.archived_at
      FROM public.catalog_items parent JOIN ancestors child ON child.parent_id = parent.id
    )
    SELECT COUNT(*) > 0 AND bool_and(is_visible AND archived_at IS NULL) AS visible FROM ancestors
  `);
  return Boolean((result.rows[0] as { visible?: boolean } | undefined)?.visible);
}

async function descendantIds(itemId: string): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT ${itemId}::uuid
      UNION ALL
      SELECT child.id FROM public.catalog_items child JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.archived_at IS NULL AND child.is_visible = true
    ) SELECT id FROM descendants
  `);
  return (result.rows as Array<{ id: string }>).map((row) => row.id);
}

async function coursesForItems(itemIds: string[]): Promise<PublicCourse[]> {
  if (itemIds.length === 0) return [];
  return db.selectDistinct({
    id: courses.id,
    title: courses.title,
    titleAr: courses.titleAr,
    subtitle: courses.subtitle,
    category: courses.category,
    level: courses.level,
    price: courses.price,
    durationText: courses.durationText,
    thumbnailUrl: courses.thumbnailUrl,
    sanaweyaGrade: courses.sanaweyaGrade,
    sanaweyaSubject: courses.sanaweyaSubject,
  }).from(courseCatalogItems)
    .innerJoin(courses, eq(courseCatalogItems.courseId, courses.id))
    .where(and(
      inArray(courseCatalogItems.catalogItemId, itemIds),
      isNull(courses.organizationId),
      eq(courses.isPublished, true),
      eq(courses.approvalStatus, 'approved'),
    ))
    .orderBy(asc(courses.title));
}

publicRouter.get('/', async (req: Request, res: Response) => {
  try {
    const track = req.query.track === undefined ? undefined : trackSchema.safeParse(req.query.track);
    if (track && !track.success) return res.status(400).json({ message: 'Invalid catalog track.' });
    const parent = req.query.parentId === undefined ? undefined : idSchema.safeParse(req.query.parentId);
    if (parent && !parent.success) return res.status(400).json({ message: 'Invalid parent id.' });
    const conditions = [eq(catalogItems.isVisible, true), isNull(catalogItems.archivedAt)];
    if (track?.success) conditions.push(eq(catalogItems.track, track.data));
    if (parent?.success) {
      if (!(await visibleTree(parent.data))) return res.json({ items: [], ...(req.query.includeCourses === 'true' ? { courses: [] } : {}) });
      conditions.push(eq(catalogItems.parentId, parent.data));
    } else {
      conditions.push(isNull(catalogItems.parentId));
    }
    const rows = await db.select().from(catalogItems).where(and(...conditions))
      .orderBy(asc(catalogItems.displayOrder), asc(catalogItems.nameEn));
    const response: { items: ReturnType<typeof publicItem>[]; courses?: PublicCourse[] } = { items: rows.map(publicItem) };
    if (req.query.includeCourses === 'true') {
      const descendantLists = await Promise.all(rows.map((row) => descendantIds(row.id)));
      response.courses = await coursesForItems([...new Set(descendantLists.flat())]);
    }
    return res.json(response);
  } catch (error) {
    console.error('catalog list error', error);
    return res.status(500).json({ message: 'Could not load catalog.' });
  }
});

publicRouter.get('/items/:id', async (req: Request, res: Response) => {
  try {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) return res.status(400).json({ message: 'Invalid catalog item id.' });
    const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, parsedId.data)).limit(1);
    if (!item || !(await visibleTree(item.id))) return res.status(404).json({ message: 'Catalog item not found.' });
    const children = await db.select().from(catalogItems).where(and(
      eq(catalogItems.parentId, item.id), eq(catalogItems.isVisible, true), isNull(catalogItems.archivedAt),
    )).orderBy(asc(catalogItems.displayOrder), asc(catalogItems.nameEn));
    const ids = await descendantIds(item.id);
    return res.json({ item: publicItem(item), children: children.map(publicItem), courses: await coursesForItems(ids) });
  } catch (error) {
    console.error('catalog item get error', error);
    return res.status(500).json({ message: 'Could not load catalog item.' });
  }
});

adminRouter.use(requireAuth, requireRole('admin'));

async function validateHierarchy(input: { track: Track; kind: Kind; parentId?: string | null }, selfId?: string) {
  const allowed = validParentKinds[input.track][input.kind];
  if (!allowed) return 'Catalog kind does not belong to the selected track.';
  if (!input.parentId) return allowed.length === 0 ? null : 'This catalog item kind requires a parent.';
  if (input.parentId === selfId) return 'An item cannot be its own parent.';
  const [parent] = await db.select({ id: catalogItems.id, track: catalogItems.track, kind: catalogItems.kind, archivedAt: catalogItems.archivedAt })
    .from(catalogItems).where(eq(catalogItems.id, input.parentId)).limit(1);
  if (!parent || parent.archivedAt) return 'Parent catalog item does not exist or is archived.';
  if (parent.track !== input.track || !allowed.includes(parent.kind as Kind)) return 'Parent catalog item does not match this hierarchy.';
  if (selfId) {
    const result = await db.execute(sql`
      WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM public.catalog_items WHERE id = ${input.parentId}::uuid
        UNION ALL
        SELECT parent.id, parent.parent_id FROM public.catalog_items parent JOIN ancestors child ON child.parent_id = parent.id
      ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ${selfId}::uuid) AS cycle
    `);
    if ((result.rows[0] as { cycle?: boolean } | undefined)?.cycle) return 'Moving this item would create a hierarchy cycle.';
  }
  return null;
}

adminRouter.get('/items', async (req: Request, res: Response) => {
  try {
    const parsedTrack = req.query.track === undefined ? undefined : trackSchema.safeParse(req.query.track);
    if (parsedTrack && !parsedTrack.success) return res.status(400).json({ message: 'Invalid catalog track.' });
    const conditions = parsedTrack?.success ? [eq(catalogItems.track, parsedTrack.data)] : [];
    const items = await db.select().from(catalogItems).where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(catalogItems.track), asc(catalogItems.parentId), asc(catalogItems.displayOrder), asc(catalogItems.nameEn));
    return res.json({ items });
  } catch (error) {
    console.error('admin catalog list error', error);
    return res.status(500).json({ message: 'Could not load catalog items.' });
  }
});

adminRouter.post('/items', async (req: Request, res: Response) => {
  const parsed = itemInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid catalog item.', issues: parsed.error.issues });
  try {
    const input = parsed.data;
    const hierarchyError = await validateHierarchy(input);
    if (hierarchyError) return res.status(400).json({ message: hierarchyError });
    const [item] = await db.insert(catalogItems).values({
      ...input,
      parentId: input.parentId ?? null,
      nameAr: input.nameAr ?? null,
      description: input.description ?? null,
      provenance: input.provenance ?? 'admin',
      metadata: input.metadata ?? {},
    }).returning();
    return res.status(201).json({ item });
  } catch (error) {
    console.error('admin catalog create error', error);
    return res.status(500).json({ message: 'Could not create catalog item.' });
  }
});

adminRouter.patch('/items/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = patchInput.safeParse(req.body);
  if (!id.success) return res.status(400).json({ message: 'Invalid catalog item id.' });
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ message: 'Invalid catalog item update.' });
  try {
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id.data)).limit(1);
    if (!existing) return res.status(404).json({ message: 'Catalog item not found.' });
    const input = { ...existing, ...parsed.data, parentId: parsed.data.parentId === undefined ? existing.parentId : parsed.data.parentId };
    const hierarchyError = await validateHierarchy({
      track: input.track as Track,
      kind: input.kind as Kind,
      parentId: input.parentId,
    }, existing.id);
    if (hierarchyError) return res.status(400).json({ message: hierarchyError });
    const [hasChildren] = await db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.parentId, existing.id)).limit(1);
    if (hasChildren && (input.track !== existing.track || input.kind !== existing.kind)) {
      return res.status(409).json({ message: 'Track and kind cannot change while this item has children.' });
    }
    const [item] = await db.update(catalogItems).set({
      ...parsed.data,
      parentId: input.parentId,
      nameAr: parsed.data.nameAr === undefined ? existing.nameAr : parsed.data.nameAr,
      description: parsed.data.description === undefined ? existing.description : parsed.data.description,
      updatedAt: new Date(),
    }).where(eq(catalogItems.id, existing.id)).returning();
    return res.json({ item });
  } catch (error) {
    console.error('admin catalog update error', error);
    return res.status(500).json({ message: 'Could not update catalog item.' });
  }
});

adminRouter.delete('/items/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Invalid catalog item id.' });
  try {
    const result = await db.execute(sql`
      WITH RECURSIVE subtree(id) AS (
        SELECT ${id.data}::uuid
        UNION ALL
        SELECT child.id FROM public.catalog_items child JOIN subtree parent ON child.parent_id = parent.id
      ) UPDATE public.catalog_items SET archived_at = COALESCE(archived_at, now()), is_visible = false
        WHERE id IN (SELECT id FROM subtree)
      RETURNING id
    `);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catalog item not found.' });
    return res.json({ archived: result.rows.length });
  } catch (error) {
    console.error('admin catalog archive error', error);
    return res.status(500).json({ message: 'Could not archive catalog item.' });
  }
});

adminRouter.post('/import', async (req: Request, res: Response) => {
  const parsed = importInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid catalog import.', issues: parsed.error.issues });
  try {
    const imported = await db.transaction(async (tx) => {
      const rows: Array<typeof catalogItems.$inferSelect> = [];
      const pending = [...parsed.data.items];
      const importedNodes: Array<typeof catalogItems.$inferSelect> = [];
      while (pending.length) {
        let progressed = false;
        for (let index = 0; index < pending.length; index += 1) {
          const input = pending[index];
          if (input.parentId && input.parentSlug) throw new Error('Provide parentId or parentSlug, not both.');

          let parentId = input.parentId ?? null;
          let parentItem: typeof catalogItems.$inferSelect | undefined;
          if (input.parentSlug) {
            const candidates = [
              ...importedNodes.filter((candidate) => candidate.track === input.track && candidate.slug === input.parentSlug),
              ...(await tx.select().from(catalogItems).where(and(
                eq(catalogItems.track, input.track), eq(catalogItems.slug, input.parentSlug),
              ))),
            ].filter((candidate, candidateIndex, all) => all.findIndex((other) => other.id === candidate.id) === candidateIndex);
            const scopedCandidates = input.parentParentSlug
              ? (await Promise.all(candidates.map(async (candidate) => {
                const importedParent = [...importedNodes, ...rows].find((row) => row.id === candidate.parentId);
                if (importedParent) return importedParent.slug === input.parentParentSlug ? candidate : null;
                if (!candidate.parentId) return null;
                const [storedParent] = await tx.select({ slug: catalogItems.slug }).from(catalogItems)
                  .where(eq(catalogItems.id, candidate.parentId)).limit(1);
                return storedParent?.slug === input.parentParentSlug ? candidate : null;
              }))).filter((candidate): candidate is typeof candidates[number] => candidate !== null)
              : candidates;
            if (scopedCandidates.length > 1) throw new Error(`Ambiguous parentSlug ${input.parentSlug}; provide parentParentSlug or parentId.`);
            if (!scopedCandidates.length) {
              // Parent may appear later in this payload; retry once other nodes are inserted.
              if (pending.some((other, otherIndex) => otherIndex !== index && other.track === input.track && other.slug === input.parentSlug)) continue;
              throw new Error(`Parent slug ${input.parentSlug} was not found in track ${input.track}.`);
            }
            parentItem = scopedCandidates[0];
            parentId = parentItem.id;
          } else if (parentId) {
            parentItem = [...importedNodes, ...rows].find((row) => row.id === parentId);
            if (!parentItem) {
              const [storedParent] = await tx.select().from(catalogItems).where(eq(catalogItems.id, parentId)).limit(1);
              parentItem = storedParent;
            }
          }

          const allowed = validParentKinds[input.track][input.kind];
          if (!allowed) throw new Error('Catalog kind does not belong to the selected track.');
          if (!parentId && allowed.length > 0) throw new Error(`${input.kind} requires a parent.`);
          if (parentId && (!parentItem || parentItem.archivedAt || parentItem.track !== input.track || !allowed.includes(parentItem.kind as Kind))) {
            throw new Error('Parent catalog item does not match this hierarchy.');
          }

          const existing = await tx.select().from(catalogItems).where(and(
            eq(catalogItems.track, input.track),
            parentId ? eq(catalogItems.parentId, parentId) : isNull(catalogItems.parentId),
            eq(catalogItems.slug, input.slug),
          )).limit(1);
          const { parentSlug: _parentSlug, parentParentSlug: _parentParentSlug, ...fields } = input;
          if (existing[0]) {
            const [updated] = await tx.update(catalogItems).set({
              ...fields,
              parentId,
              nameAr: fields.nameAr ?? null,
              description: fields.description ?? null,
              provenance: fields.provenance ?? 'import',
              metadata: fields.metadata ?? {},
              updatedAt: new Date(),
            }).where(eq(catalogItems.id, existing[0].id)).returning();
            rows.push(updated);
          } else {
            const [created] = await tx.insert(catalogItems).values({
              ...fields,
              parentId,
              nameAr: fields.nameAr ?? null,
              description: fields.description ?? null,
              provenance: fields.provenance ?? 'import',
              metadata: fields.metadata ?? {},
            }).returning();
            rows.push(created);
          }
          importedNodes.push(rows[rows.length - 1]);
          pending.splice(index, 1);
          progressed = true;
          break;
        }
        if (!progressed) throw new Error('Catalog import has unresolved parent slugs or a parent cycle.');
      }
      return rows;
    });
    return res.json({ imported: imported.length, items: imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import catalog items.';
    console.error('admin catalog import error', error);
    return res.status(message.includes('hierarchy') || message.includes('parent') ? 400 : 500).json({ message });
  }
});

adminRouter.get('/courses', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: courses.id,
      title: courses.title,
      titleAr: courses.titleAr,
      category: courses.category,
      level: courses.level,
      isPublished: courses.isPublished,
      sanaweyaGrade: courses.sanaweyaGrade,
      sanaweyaSubject: courses.sanaweyaSubject,
    }).from(courses).where(isNull(courses.organizationId)).orderBy(asc(courses.title));
    return res.json({ courses: rows });
  } catch (error) {
    console.error('admin catalog courses list error', error);
    return res.status(500).json({ message: 'Could not load global courses.' });
  }
});

adminRouter.get('/courses/:courseId', async (req: Request, res: Response) => {
  const courseId = idSchema.safeParse(req.params.courseId);
  if (!courseId.success) return res.status(400).json({ message: 'Invalid course id.' });
  try {
    const [course] = await db.select({ id: courses.id, organizationId: courses.organizationId })
      .from(courses).where(eq(courses.id, courseId.data)).limit(1);
    if (!course) return res.status(404).json({ message: 'Course not found.' });
    if (course.organizationId !== null) return res.status(400).json({ message: 'Organization courses are not part of the global catalog.' });
    const links = await db.select({ catalogItemId: courseCatalogItems.catalogItemId })
      .from(courseCatalogItems).where(eq(courseCatalogItems.courseId, course.id));
    return res.json({ courseId: course.id, catalogItemIds: links.map((link) => link.catalogItemId) });
  } catch (error) {
    console.error('admin catalog course associations get error', error);
    return res.status(500).json({ message: 'Could not load course classifications.' });
  }
});

adminRouter.put('/courses/:courseId', async (req: Request, res: Response) => {
  const courseId = idSchema.safeParse(req.params.courseId);
  const parsed = courseAssociationInput.safeParse(req.body);
  if (!courseId.success) return res.status(400).json({ message: 'Invalid course id.' });
  if (!parsed.success) return res.status(400).json({ message: 'Provide up to 30 valid catalog item ids.' });
  try {
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId.data)).limit(1);
    if (!course) return res.status(404).json({ message: 'Course not found.' });
    if (course.organizationId !== null) return res.status(400).json({ message: 'Organization courses cannot be assigned to the global academic catalog.' });
    const ids = [...new Set(parsed.data.catalogItemIds)];
    const items = ids.length ? await db.select().from(catalogItems).where(inArray(catalogItems.id, ids)) : [];
    if (items.length !== ids.length || items.some((item) => item.archivedAt)) return res.status(400).json({ message: 'One or more catalog items are unavailable.' });
    const trackSet = new Set(items.map((item) => item.track));
    if (trackSet.size > 1) return res.status(400).json({ message: 'A course cannot be classified in multiple catalog tracks.' });

    if (items.length > 1) {
      const ancestorsByItem = await Promise.all(items.map(async (item) => {
        const result = await db.execute(sql`
          WITH RECURSIVE ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM public.catalog_items WHERE id = ${item.id}::uuid
            UNION ALL
            SELECT parent.id, parent.parent_id FROM public.catalog_items parent JOIN ancestors child ON child.parent_id = parent.id
          ) SELECT id FROM ancestors
        `);
        return new Set((result.rows as Array<{ id: string }>).map((row) => row.id));
      }));
      const followsSinglePath = items.every((item, index) => items.every((other, otherIndex) =>
        index === otherIndex || ancestorsByItem[index].has(other.id) || ancestorsByItem[otherIndex].has(item.id),
      ));
      if (!followsSinglePath) {
        return res.status(400).json({ message: 'Course classifications must all follow one hierarchy path.' });
      }
    }

    const schoolItems = items.filter((item) => item.track === 'school');
    if (schoolItems.some((item) => item.kind === 'grade' && course.sanaweyaGrade
      && String(item.metadata.originalValue ?? item.nameEn) !== course.sanaweyaGrade.trim())) {
      return res.status(400).json({ message: 'The selected grade conflicts with this course’s legacy Sanaweya grade.' });
    }
    if (schoolItems.some((item) => item.kind === 'subject' && course.sanaweyaSubject
      && String(item.metadata.originalValue ?? item.nameEn) !== course.sanaweyaSubject.trim())) {
      return res.status(400).json({ message: 'The selected subject conflicts with this course’s legacy Sanaweya subject.' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(courseCatalogItems).where(eq(courseCatalogItems.courseId, course.id));
      if (ids.length) await tx.insert(courseCatalogItems).values(ids.map((catalogItemId) => ({ courseId: course.id, catalogItemId })));
    });
    return res.json({ courseId: course.id, catalogItemIds: ids });
  } catch (error) {
    console.error('admin catalog course association error', error);
    return res.status(500).json({ message: 'Could not update course classifications.' });
  }
});

export { publicRouter as catalogRouter, adminRouter as adminCatalogRouter };
