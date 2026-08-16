import React, { useState } from 'react';
import {
  Calculator,
  FileSearch,
  MessageCircleQuestion,
  ShieldAlert,
  MessageSquare,
  Loader2,
  Sparkles,
  Home,
  Bath,
  MapPin,
  Maximize2,
  DollarSign,
  Layers,
  ThumbsUp,
  Lightbulb,
  X,
  Pencil,
} from 'lucide-react';
import { Link, useParams } from 'wouter';
import AddListingModal from '../components/AddListingModal';
import {
  useApartment,
  useAiReview,
  useGenerateAiReview,
  useSetApartmentActive,
} from '../lib/useApartments';

export default function ApartmentDetailView() {
  const params = useParams();
  const id = params?.id || '';
  const { data: apartment, isLoading } = useApartment(id);
  const [isEditing, setIsEditing] = useState(false);
  const setActiveMutation = useSetApartmentActive();
  const { data: aiReviewData } = useAiReview(id);
  const { mutate: generateReview, isPending: isGeneratingReview } = useGenerateAiReview();


  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-sm font-semibold text-zinc-400">Loading apartment details & MCDA scores...</span>
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-bold">Listing Not Found</h2>
        <p className="text-sm text-zinc-400">The apartment you are looking for does not exist or has been removed.</p>
        <Link href="/">
          <button className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold border border-zinc-800 transition-all">
            Return to Dashboard
          </button>
        </Link>
      </div>
    );
  }

  const formatPrice = (price?: number | null, currency?: string | null) => {
    if (!price) return 'Price N/A';
    const curr = currency || 'EUR';
    try {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(price);
    } catch {
      return `${price} ${curr}`;
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/20 selection:text-blue-400">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-50 shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="font-extrabold text-lg sm:text-xl text-zinc-100 truncate">
            {apartment.title || 'Apartment'}
          </h1>
          <span className="text-xs font-extrabold text-emerald-400 mt-0.5 block">
            {formatPrice(apartment.price, apartment.currency)}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {apartment.mcdaScore !== null && (
            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 font-extrabold text-sm min-h-[44px]">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span>{Math.round(apartment.mcdaScore)}% Match</span>
            </div>
          )}
          <button
            onClick={() => setIsEditing(true)}
            title="Edit details and ratings"
            aria-label="Edit details and ratings"
            className="w-11 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 border border-zinc-800 hover:border-blue-500/40 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <Link href="/">
            <button
              title="Close to Dashboard"
              className="w-11 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full space-y-12">
        {(() => {
          const extJson = (apartment as any).extractedData || (apartment.featureScores as any)?.extractedData || {};
          // No placeholder review: an invented verdict on a real apartment is worse
          // than no verdict. `null` renders an explicit "not analysed yet" state.
          const aiReview = extJson.aiReview || aiReviewData || null;
          // Compromise data is written by the scoring pipeline, derived from the MCDA
          // evaluation — never from the AI review's prose.
          const compromiseData = (apartment.featureScores as any)?.compromise || null;
          // Derived from the score in code, never written by a model, and rewritten
          // every time the score is — so it cannot describe a stale evaluation.
          const highlights = (apartment.featureScores as any)?.highlights || null;

          const officialTitle = extJson.title || apartment.title || 'Official Property Listing';
          const rawDescription = extJson.description || (apartment.featureScores as any)?.rawDescription || (apartment as any).rawDescription || 'No detailed description available for this property.';
          // Portal descriptions arrive with markup baked into the text. Convert the
          // line breaks and strip the rest rather than rendering tags as literal text.
          // Never use dangerouslySetInnerHTML here — this string is scraped content.
          const description = rawDescription
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          const areaSqm = extJson.unitMetrics?.floorSizeSqm ?? extJson.areaSqm ?? extJson.floorSizeSqm;
          const roomsTotal = extJson.unitMetrics?.totalRooms ?? extJson.roomsTotal ?? extJson.totalRooms ?? extJson.bedrooms;
          const bathrooms = extJson.unitMetrics?.bathrooms ?? extJson.bathrooms;
          const floorLevel = extJson.unitMetrics?.floorLevel ?? extJson.floorLevel;
          const neighborhood = extJson.location?.neighborhood;
          const city = extJson.location?.city;
          const locationStr = [neighborhood, city].filter(Boolean).join(', ') || extJson.locationStr;

          return (
            <div className="space-y-8 animate-in fade-in duration-300 pb-12">
              {/* Title, Description & Metrics */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-1.5">
                    <Home className="w-3.5 h-3.5 shrink-0" />
                    Official Listing Title
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight leading-snug mb-2">
                    {officialTitle}
                  </h2>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-normal">
                    {description}
                  </p>
                </div>

                {/* Metrics — tightened, and location spans two cells so a long
                    neighbourhood/city string is not truncated to nothing */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <DollarSign className="w-3 h-3 text-emerald-400 shrink-0" />
                      Rent
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-emerald-400 leading-tight">
                      {formatPrice(apartment.price || extJson.price?.amount, apartment.currency || extJson.price?.currency)}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <Maximize2 className="w-3 h-3 text-blue-400 shrink-0" />
                      Area
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100 leading-tight">{areaSqm ? `${areaSqm} m²` : '—'}</span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <Home className="w-3 h-3 text-amber-400 shrink-0" />
                      Rooms
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100 leading-tight">{roomsTotal ?? '—'}</span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <Bath className="w-3 h-3 text-purple-400 shrink-0" />
                      Baths
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100 leading-tight">{bathrooms ?? '—'}</span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <Layers className="w-3 h-3 text-indigo-400 shrink-0" />
                      Floor
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100 leading-tight truncate">{floorLevel || '—'}</span>
                  </div>

                  <div className="col-span-2 sm:col-span-3 bg-zinc-950/80 border border-zinc-800/80 px-3 py-2.5 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1 leading-none">
                      <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                      Location
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-zinc-100 leading-tight break-words">{locationStr || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Pursuit state — separate from the score, which is a measurement */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                      Pipeline status
                    </span>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        apartment.isActive
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {apartment.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-md">
                    {apartment.isActive
                      ? 'You are pursuing this listing. Its AI review and outreach draft have been generated.'
                      : 'Not being pursued, so no AI review or outreach draft has been written for it. Activating generates both — the score and its bucket stay exactly as they are.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveMutation.mutate({ id: apartment.id, isActive: !apartment.isActive })
                  }
                  disabled={setActiveMutation.isPending}
                  className={`shrink-0 min-h-[44px] px-5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
                    apartment.isActive
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  }`}
                >
                  {setActiveMutation.isPending
                    ? 'Working...'
                    : apartment.isActive
                      ? 'Set inactive'
                      : 'Activate & analyse'}
                </button>
              </div>

              {/* 3. Score Overview Without Technical Jargon */}
              <div className="bg-gradient-to-br from-blue-950/40 via-zinc-900/90 to-zinc-900 border border-blue-500/30 p-6 sm:p-8 rounded-3xl shadow-xl space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
                      <Sparkles className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base sm:text-lg text-zinc-100">
                        Match Analysis
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Personal Compatibility & Non-Negotiable Alignment
                      </p>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 px-4 py-2 rounded-2xl flex items-center gap-2">
                    <span className="text-xl font-black text-blue-400">
                      {apartment.mcdaScore !== null ? `${Math.round(apartment.mcdaScore)}%` : '—'}
                    </span>
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                      Personal Match
                    </span>
                  </div>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Our decision algorithm evaluated this listing against your customized non-negotiables, dealbreakers, and room quality standards. This score represents how well this specific home fits your lifestyle without sacrificing your top priorities.
                </p>
              </div>

              {/* 4. AI Review (Pros, Compromise Summary, Recommendation) */}
              <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-zinc-100">
                        Assessment
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Measured from your ratings, and read from the listing text
                      </p>
                    </div>
                  </div>
                  {!(extJson.aiReview || aiReviewData) && (
                    <button
                      onClick={() => generateReview(id)}
                      disabled={isGeneratingReview}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                    >
                      {isGeneratingReview ? 'Generating...' : 'Generate AI Review'}
                    </button>
                  )}
                </div>

                {!highlights && !aiReview ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center gap-2">
                    <Lightbulb className="w-8 h-8 text-zinc-700" />
                    <p className="text-sm font-bold text-zinc-400">Not assessed yet</p>
                    <p className="text-xs text-zinc-600 max-w-sm leading-relaxed">
                      Nothing here is filled in with sample data.
                    </p>
                  </div>
                ) : (
                  <>

                {/* ---- MEASURED: computed from your ratings, no model involved ---- */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                      Measured from your ratings
                    </span>
                  </div>

                  {highlights?.verdict && (
                    <p className="text-sm text-zinc-200 leading-relaxed font-medium">
                      {highlights.verdict}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2.5 bg-emerald-950/10 border border-emerald-500/20 p-4 rounded-2xl">
                      <h4 className="font-extrabold text-xs text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Strengths</span>
                      </h4>
                      {highlights?.strengths?.length > 0 ? (
                        <ul className="space-y-2">
                          {highlights.strengths.map((point: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">Nothing you weighted highly scored well.</p>
                      )}
                    </div>

                    <div className="space-y-2.5 bg-amber-950/10 border border-amber-500/20 p-4 rounded-2xl">
                      <h4 className="font-extrabold text-xs text-amber-400 flex items-center gap-2 uppercase tracking-wider">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>Shortfalls</span>
                      </h4>
                      {highlights?.concerns?.length > 0 ? (
                        <ul className="space-y-2">
                          {highlights.concerns.map((point: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">Nothing measurable fell short.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ---- READ: the only part a model produced ---- */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2">
                    <FileSearch className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-blue-400">
                      Read from the listing text
                    </span>
                  </div>

                  {!aiReview || aiReview.analysed === false ? (
                    <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
                      The listing text has not been read. Activate this listing to have its
                      description checked for lease terms, fees and restrictions.
                    </p>
                  ) : aiReview.flags?.length === 0 && aiReview.unknowns?.length === 0 ? (
                    <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-950 border border-zinc-800 p-4 rounded-2xl">
                      Read, and nothing worth flagging was found. The description states no
                      unusual conditions and covers everything you weighted highly.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {aiReview.flags?.length > 0 && (
                        <div className="space-y-3 bg-red-950/10 border border-red-500/20 p-4 rounded-2xl">
                          <h4 className="font-extrabold text-xs text-red-400 flex items-center gap-2 uppercase tracking-wider">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>Conditions in the listing</span>
                          </h4>
                          <ul className="space-y-3">
                            {aiReview.flags.map((flag: any, idx: number) => (
                              <li key={idx} className="space-y-1">
                                <p className="text-xs sm:text-sm text-zinc-100 leading-relaxed font-semibold">
                                  {flag.issue}
                                </p>
                                {/* Quoted verbatim, and verified server-side to exist
                                    in the description before it can be shown. */}
                                <p className="text-xs text-zinc-400 italic leading-relaxed border-l-2 border-red-500/40 pl-2.5 whitespace-pre-line break-words">
                                  {flag.quote}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aiReview.unknowns?.length > 0 && (
                        <div className="space-y-3 bg-blue-950/10 border border-blue-500/20 p-4 rounded-2xl">
                          <h4 className="font-extrabold text-xs text-blue-400 flex items-center gap-2 uppercase tracking-wider">
                            <MessageCircleQuestion className="w-3.5 h-3.5 shrink-0" />
                            <span>Ask before you commit</span>
                          </h4>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Weighted highly by you, and never addressed in the description.
                          </p>
                          <ul className="space-y-2.5">
                            {aiReview.unknowns.map((unknown: any, idx: number) => (
                              <li key={idx} className="text-xs sm:text-sm leading-relaxed">
                                <span className="font-semibold text-zinc-100">{unknown.feature}</span>
                                <span className="text-zinc-400"> — {unknown.ask}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {compromiseData?.sacrifices?.length > 0 && (
                  <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-2xl space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
                      What you give up
                    </span>
                    <ul className="space-y-1.5">
                      {compromiseData.sacrifices.map((sac: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <span>{sac}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Floating Bottom-Right Chat Button */}
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in zoom-in duration-300">
          <Link href={`/apartments/${apartment.id}/chat`}>
            <button
              title="Open Communications Hub"
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold px-6 py-4 rounded-full shadow-2xl shadow-blue-500/30 flex items-center gap-3 transition-all cursor-pointer active:scale-95 border border-blue-400/30 min-h-[56px]"
            >
              <MessageSquare className="w-5 h-5 fill-current" />
              <span className="text-base sm:text-lg">Chat</span>
            </button>
          </Link>
        </div>
      </main>

      {/* Editing re-scores on save, so the header percentage above can move as
          soon as the modal closes — that is the point of it. */}
      <AddListingModal isOpen={isEditing} onClose={() => setIsEditing(false)} editing={apartment} />
    </div>
  );
}
