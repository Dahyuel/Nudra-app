import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, School, University, ChevronRight } from 'lucide-react';
import api from '../lib/api';

type AcademicTrack = 'school' | 'university';

type CatalogItem = {
  id: string;
  track: AcademicTrack | 'general';
  kind: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  displayOrder: number;
  isVisible: boolean;
  provenance?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CatalogCourse = {
  id: string;
  title: string;
  titleAr?: string | null;
  subtitle?: string | null;
  category?: string | null;
  level?: string | null;
  price?: string | number | null;
  durationText?: string | null;
  thumbnailUrl?: string | null;
  sanaweyaGrade?: string | null;
  sanaweyaSubject?: string | null;
};

type CatalogResponse = {
  items?: CatalogItem[];
  item?: CatalogItem;
  children?: CatalogItem[];
  courses?: CatalogCourse[];
};

const kindLabel = (kind: string) => kind.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const panelClass = 'rounded-2xl border border-gray-100 bg-white shadow-sm';
const mutedText = 'text-sm leading-6 text-gray-500';

export const AcademicHomePage: React.FC = () => (
  <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-8 max-w-3xl">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#2D6A4F]">Academic</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1B1B1B] sm:text-4xl">Choose your learning path</h1>
      <p className="mt-3 text-gray-600">Explore courses organized around school curricula and university programs.</p>
    </div>

    <div className="grid gap-5 md:grid-cols-2">
      <Link to="/academic/school" className={`${panelClass} group p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:p-8`}>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-[#2D6A4F]"><School size={28} /></span>
        <h2 className="mt-5 text-2xl font-bold text-gray-900">School</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">Browse school curricula, stages, grades, and subjects.</p>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]">Explore school <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
      </Link>

      <Link to="/academic/university" className={`${panelClass} group p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md sm:p-8`}>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><University size={28} /></span>
        <h2 className="mt-5 text-2xl font-bold text-gray-900">University</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">Browse universities, faculties, programs, and their courses.</p>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]">Explore university <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
      </Link>
    </div>

    <Link to="/organizations" className={`${panelClass} group mt-6 flex flex-col justify-between gap-4 p-5 transition hover:border-emerald-200 hover:shadow-md sm:flex-row sm:items-center sm:p-6`}>
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700"><GraduationCap size={25} /></span>
        <div><h2 className="font-bold text-gray-900">Learn with an organization</h2><p className="mt-1 text-sm text-gray-600">Find schools, academies, and other organizations offering their own learning spaces.</p></div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-[#2D6A4F]">Browse organizations <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
    </Link>
  </main>
);

export const AcademicCatalogPage: React.FC = () => {
  const { track: rawTrack, itemId } = useParams<{ track: string; itemId?: string }>();
  const track: AcademicTrack | null = rawTrack === 'school' || rawTrack === 'university' ? rawTrack : null;
  const trackName = track === 'school' ? 'School' : 'University';
  const TrackIcon = track === 'school' ? School : University;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['academic-catalog', track, itemId],
    enabled: track !== null,
    queryFn: async () => {
      const response = itemId
        ? await api.get<CatalogResponse>(`/api/catalog/items/${encodeURIComponent(itemId)}`)
        : await api.get<CatalogResponse>('/api/catalog', { params: { track, includeCourses: true } });
      return response.data;
    },
    staleTime: 60_000,
  });

  if (!track) {
    return <CatalogMessage title="Academic path not found" body="Choose School or University from the Academic area." />;
  }

  const activeItem = data?.item;
  const children = itemId ? data?.children ?? [] : data?.items ?? [];
  const courses = data?.courses ?? [];
  const nationalItem = track === 'school' && !itemId
    ? children.find((item) => /national/i.test(item.slug) || /national/i.test(item.nameEn))
    : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/academic" className="hover:text-[#2D6A4F]">Academic</Link>
        <ChevronRight size={15} />
        <Link to={`/academic/${track}`} className="hover:text-[#2D6A4F]">{trackName}</Link>
        {activeItem && <><ChevronRight size={15} /><span className="font-semibold text-gray-800">{activeItem.nameEn}</span></>}
      </div>

      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-[#2D6A4F]"><TrackIcon size={23} /></span>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#2D6A4F]">{trackName} track</p>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#1B1B1B] sm:text-4xl">
            {activeItem?.nameEn ?? (track === 'school' ? 'School curricula' : 'Universities')}
          </h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            {activeItem?.description || (track === 'school'
              ? 'Choose a curriculum and continue through its stages, grades, and subjects.'
              : 'Choose a university to explore its faculties, programs, and courses.')}
          </p>
        </div>
        {activeItem && (
          <Link to={activeItem.parentId ? `/academic/${track}/${activeItem.parentId}` : `/academic/${track}`} className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:self-auto">
            <ArrowLeft size={16} /> {activeItem.parentId ? 'Previous level' : `All ${trackName.toLowerCase()} options`}
          </Link>
        )}
      </header>

      {track === 'school' && !itemId && (
        <section className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <p className="font-bold text-gray-900">Egyptian National school track</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {nationalItem
                ? `Continue with ${nationalItem.nameEn} in the academic catalog, or open the existing Sanaweya learning area.`
                : 'Open the existing Sanaweya courses, exams, and saved learning progress.'}
            </p>
          </div>
          <Link to={nationalItem ? `/academic/school/${nationalItem.id}` : '/sanaweya'} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#24583f]">
            {nationalItem ? 'Browse National curriculum' : 'Open National track'} <ArrowRight size={16} />
          </Link>
          {nationalItem && <Link to="/sanaweya" className="self-start text-sm font-semibold text-[#2D6A4F] underline underline-offset-4 sm:self-center">Open current Sanaweya courses and exams</Link>}
        </section>
      )}

      {isLoading ? (
        <div className={`${panelClass} grid min-h-48 place-items-center`}><span className="text-sm text-gray-500">Loading academic catalog…</span></div>
      ) : error ? (
        <div className={`${panelClass} p-6`} role="alert">
          <h2 className="font-bold text-gray-900">The catalog could not be loaded</h2>
          <p className="mt-2 text-sm text-gray-600">Check your connection and try again.</p>
          <button onClick={() => void refetch()} className="mt-4 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      ) : (
        <>
          {children.length > 0 && (
            <section aria-labelledby="academic-catalog-items">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><h2 id="academic-catalog-items" className="text-xl font-bold text-gray-900">{activeItem ? 'Continue exploring' : `Browse ${trackName.toLowerCase()} options`}</h2><p className="mt-1 text-sm text-gray-500">{activeItem ? 'Choose the next level to view its courses.' : 'Select an item to see its next levels and related courses.'}</p></div>
                <span className="hidden text-sm text-gray-400 sm:block">{children.length} {children.length === 1 ? 'option' : 'options'}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {children.map((item) => (
                  <Link key={item.id} to={`/academic/${track}/${item.id}`} className={`${panelClass} group p-5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-50 text-[#2D6A4F]"><BookOpen size={21} /></span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-gray-500">{kindLabel(item.kind)}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-gray-900">{item.nameEn}</h3>
                    {item.description && <p className={`mt-2 ${mutedText} line-clamp-3`}>{item.description}</p>}
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]">View {kindLabel(item.kind).toLowerCase()} <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {courses.length > 0 && (
            <section className={children.length ? 'mt-10' : ''} aria-labelledby="academic-courses">
              <h2 id="academic-courses" className="mb-4 text-xl font-bold text-gray-900">Courses</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <Link key={course.id} to={`/course/${course.id}`} className={`${panelClass} group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md`}>
                    {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center bg-emerald-50 text-[#2D6A4F]"><BookOpen size={36} /></div>}
                    <div className="p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#2D6A4F]">{[course.category, course.level].filter(Boolean).join(' · ') || 'Academic course'}</p>
                      <h3 className="mt-2 text-lg font-bold text-gray-900 group-hover:text-[#2D6A4F]">{course.title}</h3>
                      {course.subtitle && <p className="mt-1 text-sm text-gray-500">{course.subtitle}</p>}
                      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                        {course.durationText && <span className="text-gray-500">{course.durationText}</span>}
                        {course.price != null && <span className="font-bold text-gray-800">{Number(course.price) > 0 ? `${Number(course.price).toLocaleString('en')} EGP` : 'Free'}</span>}
                        <span className="inline-flex items-center gap-1 font-bold text-[#2D6A4F]">Open <ArrowRight size={14} /></span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!children.length && !courses.length && (
            <section className={`${panelClass} px-6 py-12 text-center`}>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gray-50 text-gray-400">{track === 'school' ? <School size={27} /> : <GraduationCap size={27} />}</span>
              <h2 className="mt-4 text-lg font-bold text-gray-900">{track === 'university' && !activeItem ? 'University listings are being prepared' : 'No catalog items here yet'}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
                {track === 'university' && !activeItem
                  ? 'There are no verified universities in the catalog yet. This page will show university and faculty courses once the catalog is populated.'
                  : activeItem
                    ? 'There are no child items or linked courses for this selection yet. Check back as the catalog grows.'
                    : 'The academic catalog does not have published entries for this track yet.'}
              </p>
              {activeItem?.parentId && <Link to={`/academic/${track}/${activeItem.parentId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]"><ArrowLeft size={15} /> Back one level</Link>}
            </section>
          )}
        </>
      )}
    </main>
  );
};

const CatalogMessage: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <main className="mx-auto max-w-3xl px-4 py-16 text-center">
    <div className={`${panelClass} px-6 py-10`}><h1 className="text-xl font-bold text-gray-900">{title}</h1><p className="mt-2 text-sm text-gray-500">{body}</p><Link to="/academic" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2D6A4F]"><ArrowLeft size={15} /> Academic home</Link></div>
  </main>
);
