import React, { useState } from 'react';
import {
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
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  TrendingUp,
  X,
} from 'lucide-react';
import { Link, useParams } from 'wouter';
import { useApartment, useAiReview, useGenerateAiReview } from '../lib/useApartments';

export default function ApartmentDetailView() {
  const params = useParams();
  const id = params?.id || '';
  const { data: apartment, isLoading } = useApartment(id);
  const { data: aiReviewData } = useAiReview(id);
  const { mutate: generateReview, isPending: isGeneratingReview } = useGenerateAiReview();

  const [currentImageIdx, setCurrentImageIdx] = useState(0);

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
          // Only ever show photos that came from the listing itself. Stock imagery
          // here would misrepresent the property being evaluated.
          const images: string[] = extJson.media?.images?.length > 0 ? extJson.media.images : [];
          const hasImages = images.length > 0;
          const getProxyUrl = (url: string) => {
            if (!url) return '';
            if (url.startsWith('/')) return url;
            return `/api/apartments/proxy-image?url=${encodeURIComponent(url)}`;
          };

          // No placeholder review: an invented verdict on a real apartment is worse
          // than no verdict. `null` renders an explicit "not analysed yet" state.
          const aiReview = extJson.aiReview || aiReviewData || null;
          // Compromise data is written by the scoring pipeline, derived from the MCDA
          // evaluation — never from the AI review's prose.
          const compromiseData = (apartment.featureScores as any)?.compromise || null;

          const title = apartment.title || 'Apartment';
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
          const isFurnished = extJson.features?.isFurnished;
          const hasElevator = extJson.features?.hasElevator;

          return (
            <div className="space-y-8 animate-in fade-in duration-300 pb-12">
              {/* 1. Interactive Mobile-First Image Gallery */}
              <div className="space-y-3">
                <div className="relative h-64 sm:h-96 w-full rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl group">
                  {!hasImages ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 gap-2">
                      <ImageIcon className="w-8 h-8 text-zinc-700" />
                      <p className="text-sm font-bold text-zinc-400">No photos from this listing</p>
                      <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                        Open the original listing to view its photos.
                      </p>
                    </div>
                  ) : (
                  <img
                    src={getProxyUrl(images[currentImageIdx % images.length])}
                    alt={`${title} - photo ${currentImageIdx + 1}`}
                    className="w-full h-full object-cover transition-all duration-500"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                    }}
                  />
                  )}

                  {hasImages && (
                  <div className="absolute top-4 right-4 bg-zinc-950/80 backdrop-blur-md text-zinc-200 text-xs font-bold px-3 py-1.5 rounded-full border border-zinc-800 flex items-center gap-1.5 shadow-lg">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>{currentImageIdx + 1} / {images.length}</span>
                  </div>
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIdx((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-950/80 hover:bg-zinc-900 text-zinc-200 border border-zinc-700/80 flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-lg"
                        title="Previous Photo"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setCurrentImageIdx((prev) => (prev + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-950/80 hover:bg-zinc-900 text-zinc-200 border border-zinc-700/80 flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-lg"
                        title="Next Photo"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIdx(idx)}
                        className={`relative w-16 sm:w-20 h-12 sm:h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                          currentImageIdx === idx ? 'border-blue-500 scale-105 shadow-md shadow-blue-500/20' : 'border-zinc-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={getProxyUrl(img)}
                          alt={`thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Title, Description & Clean Mobile-First Metrics */}
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

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Price / Rent
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-400">
                      {formatPrice(apartment.price || extJson.price?.amount, apartment.currency || extJson.price?.currency)}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Maximize2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      Living Area
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100">
                      {areaSqm ? `${areaSqm} m²` : 'N/A'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Home className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Rooms Total
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100">
                      {roomsTotal ? `${roomsTotal} Room${Number(roomsTotal) > 1 ? 's' : ''}` : 'N/A'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Bath className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      Bathrooms
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100">
                      {bathrooms ? `${bathrooms} Bath${Number(bathrooms) > 1 ? 's' : ''}` : '1 Bath'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      Floor Level
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100 truncate">
                      {floorLevel || 'N/A'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      Location
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100 truncate">
                      {locationStr || 'Madrid'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      Elevator
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100">
                      {hasElevator !== undefined && hasElevator !== null ? (hasElevator ? 'Yes' : 'No') : 'N/A'}
                    </span>
                  </div>

                  <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-2xl flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                      <Home className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      Furnished
                    </span>
                    <span className="text-base sm:text-lg font-black text-zinc-100">
                      {isFurnished !== undefined && isFurnished !== null ? (isFurnished ? 'Yes' : 'No') : 'N/A'}
                    </span>
                  </div>
                </div>
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
                      {apartment.mcdaScore !== null ? `${apartment.mcdaScore}%` : '85%'}
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
                        AI Review
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Automated Advantages, Compromise Summary & Final Verdict
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

                {!aiReview && !compromiseData ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center gap-2">
                    <Lightbulb className="w-8 h-8 text-zinc-700" />
                    <p className="text-sm font-bold text-zinc-400">This listing hasn't been analysed yet</p>
                    <p className="text-xs text-zinc-600 max-w-sm leading-relaxed">
                      Generate a review to see advantages, trade-offs and a recommendation based on your
                      profile. Nothing here is filled in with sample data.
                    </p>
                  </div>
                ) : (
                  <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Pros */}
                  <div className="space-y-3 bg-emerald-950/10 border border-emerald-500/20 p-5 rounded-2xl">
                    <h4 className="font-extrabold text-sm text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                      <ThumbsUp className="w-4 h-4" />
                      <span>Key Advantages</span>
                    </h4>
                    {aiReview?.pros?.length > 0 ? (
                      <ul className="space-y-2.5">
                        {aiReview.pros.map((pro: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                            <span>{pro}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-zinc-500 italic leading-relaxed">
                        No advantages recorded yet.
                      </p>
                    )}
                  </div>

                  {/* Compromise Summary */}
                  <div className="space-y-3 bg-amber-950/10 border border-amber-500/20 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-amber-400 flex items-center gap-2 uppercase tracking-wider mb-3">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Compromise Summary</span>
                      </h4>
                      <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-normal">
                        {compromiseData?.summary ? (
                          compromiseData.summary
                        ) : (
                          <span className="text-zinc-400 italic">
                            No specific trade-offs or dealbreaker compromises detected yet for this property.
                          </span>
                        )}
                      </p>
                    </div>
                    {compromiseData?.sacrifices?.length > 0 && (
                      <div className="pt-3 border-t border-amber-500/20 mt-3 space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 block">Key Sacrifices:</span>
                        <ul className="space-y-1">
                          {compromiseData.sacrifices.slice(0, 3).map((sac: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                              <span>{sac}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendation */}
                {aiReview?.recommendation && (
                  <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      AI Action Recommendation
                    </span>
                    <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-medium">
                      "{aiReview.recommendation}"
                    </p>
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
    </div>
  );
}
