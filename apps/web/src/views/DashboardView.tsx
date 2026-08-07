import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Settings,
  Sparkles,
  ExternalLink,
  Trash2,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  MessageCircle,
  Eye,
  Globe,
  DollarSign,
  Tag,
  Clock,
} from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '../lib/useAuth';
import { useApartments, useDeleteApartment } from '../lib/useApartments';
import type { Apartment } from '@leaseops/db';
import AddListingModal from '../components/AddListingModal';

export default function DashboardView() {
  const { data: authState } = useAuth();

  const { data: apartments = [], isLoading: isApartmentsLoading } = useApartments();
  const deleteApartmentMutation = useDeleteApartment();

  // Add Apartment Full-Screen State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Partition apartments into Meeting Criteria and Not Perfectly Meeting Criteria
  const meetingCriteriaList = apartments.filter((apt) => apt.status === 'QUALIFIED');
  const didNotMatchPerfectlyList = apartments.filter((apt) => apt.status !== 'QUALIFIED');

  const formatPrice = (price: number, currency: string) => {
    try {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(price);
    } catch {
      return `${price} ${currency}`;
    }
  };

  // FULL SCREEN ADD PROPERTY VIEW
  if (isAddModalOpen) {
    return <AddListingModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />;
  }

  // MAIN DASHBOARD VIEW
  return (
    <div className="flex-1 flex flex-col justify-between min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Top Navigation Bar - Responsive & Touch-Friendly */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Building2 className="w-5 h-5 text-zinc-950 font-bold" />
          </div>
          <div>
            <span className="font-extrabold tracking-tight text-base sm:text-lg bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              LeaseOps
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/settings">
            <button className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-all p-2 rounded-xl border border-transparent hover:border-zinc-800 cursor-pointer active:scale-95 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </Link>
        </div>
      </header>

      {/* Main Home Screen Command Center */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 w-full flex flex-col gap-8 sm:gap-10">
        
        {/* BIG PLUS BUTTON SECTION - Prominent Mobile Touch Target */}
        <div className="flex flex-col items-center justify-center pt-2 sm:pt-4 pb-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2.5 bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-base sm:text-sm px-6 py-4 sm:py-3.5 rounded-2xl shadow-xl shadow-blue-500/25 hover:shadow-blue-500/35 transition-all min-h-[52px] sm:min-h-[48px] w-full max-w-lg cursor-pointer border border-blue-400/20 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span>Add Apartment Listing URL</span>
          </button>
        </div>

        {/* SECTION 1: MEETING CRITERIA */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
                Meeting Criteria
              </h2>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono shrink-0">
              {meetingCriteriaList.length} {meetingCriteriaList.length === 1 ? 'Listing' : 'Listings'}
            </span>
          </div>

          {isApartmentsLoading ? (
            <div className="py-12 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
              <p className="text-sm">Loading your apartments...</p>
            </div>
          ) : meetingCriteriaList.length === 0 ? (
            <div className="py-12 sm:py-14 bg-zinc-900/20 border-2 border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-300 text-base mb-1">No apartments meeting your criteria yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm mb-5 leading-relaxed">
                Apartments that meet all your must-have features and fit your budget will appear here.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="text-sm font-bold px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2 min-h-[48px] w-full sm:w-auto cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" /> Add First Listing
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {meetingCriteriaList.map((apt) => (
                <ApartmentCard
                  key={apt.id}
                  apartment={apt}
                  formatPrice={formatPrice}
                  onDelete={() => deleteApartmentMutation.mutate(apt.id)}
                  isDeleting={deleteApartmentMutation.isPending && deleteApartmentMutation.variables === apt.id}
                  zone="green"
                />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 2: NOT PERFECTLY MEETING CRITERIA */}
        <section className="space-y-4 pt-2 sm:pt-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
                Not Perfectly Meeting Criteria
              </h2>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono shrink-0">
              {didNotMatchPerfectlyList.length} {didNotMatchPerfectlyList.length === 1 ? 'Listing' : 'Listings'}
            </span>
          </div>

          {isApartmentsLoading ? (
            <div className="py-12 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-2" />
              <p className="text-sm">Loading imperfect matches...</p>
            </div>
          ) : didNotMatchPerfectlyList.length === 0 ? (
            <div className="py-12 sm:py-14 bg-zinc-900/20 border-2 border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3 border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-300 text-base mb-1">No imperfect matches yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
                Apartments that are missing a must-have feature or exceed your budget will appear here so you can decide if it's worth compromising.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {didNotMatchPerfectlyList.map((apt) => (
                <ApartmentCard
                  key={apt.id}
                  apartment={apt}
                  formatPrice={formatPrice}
                  onDelete={() => deleteApartmentMutation.mutate(apt.id)}
                  isDeleting={deleteApartmentMutation.isPending && deleteApartmentMutation.variables === apt.id}
                  zone="yellow"
                />
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-zinc-600 text-xs mt-12">
        LeaseOps — Simple apartment hunting.
      </footer>
    </div>
  );
}

/**
 * Individual Apartment Card Component.
 * Styled dynamically based on whether it resides in the Green Zone or Yellow Zone.
 */
function ApartmentCard({
  apartment,
  formatPrice,
  onDelete,
  isDeleting,
  zone,
}: {
  apartment: Apartment;
  formatPrice: (price: number, currency: string) => string;
  onDelete: () => void;
  isDeleting: boolean;
  zone: 'green' | 'yellow';
}) {
  const isGreen = zone === 'green';
  const isError = apartment.status === 'ERROR';
  const score = apartment.mcdaScore ?? 0;
  const isUnprocessed = apartment.status === 'UNPROCESSED';

  // Extract compromise summary or dealbreaker info if in yellow zone
  const featureScores = apartment.featureScores as any;
  const compromiseText = featureScores?.compromise?.summary || 
                         (featureScores?.result?.dealbreakerReasons?.length
                           ? `Missing requirement: ${featureScores.result.dealbreakerReasons[0]}`
                           : 'Missing a must-have feature or exceeds your target rent.');

  return (
    <div
      className={`group rounded-2xl border transition-all duration-200 p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden shadow-lg ${
        isGreen
          ? 'bg-zinc-900/80 border-emerald-500/30 hover:border-emerald-500/60 shadow-emerald-500/5 hover:shadow-emerald-500/10'
          : isError
            ? 'bg-zinc-900/80 border-red-500/30 hover:border-red-500/60 shadow-red-500/5 hover:shadow-red-500/10'
            : 'bg-zinc-900/80 border-amber-500/30 hover:border-amber-500/60 shadow-amber-500/5 hover:shadow-amber-500/10'
      }`}
    >
      {/* Top row: Score badge & Price */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          {isUnprocessed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20 animate-pulse shrink-0">
              <Clock className="w-3 h-3 animate-spin" /> Checking...
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border shrink-0 ${
                isGreen
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : isError
                    ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              }`}
            >
              {isGreen ? <CheckCircle2 className="w-3.5 h-3.5" /> : isError ? <ShieldAlert className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {isError ? 'Error' : `${score}% Match`}
            </span>
          )}

          <span className="font-extrabold text-base sm:text-lg tracking-tight text-zinc-100 font-mono text-right break-words">
            {formatPrice(apartment.price, apartment.currency)}
          </span>
        </div>

        {/* Title & Domain - Readable on Mobile without truncation */}
        <h3 className="font-bold text-zinc-100 text-base sm:text-lg leading-snug mb-1.5 break-words group-hover:text-blue-400 transition-colors">
          {apartment.title}
        </h3>
        <a
          href={apartment.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 w-fit mb-4 transition-colors py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="break-all">{new URL(apartment.url).hostname}</span>
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>

        {/* Zone Specific Feedback Block */}
        <div className="mb-5">
          {isUnprocessed ? (
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
              <span className="leading-relaxed">Evaluating apartment features and rent against your profile...</span>
            </div>
          ) : isGreen ? (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-3 h-3 shrink-0" /> Meets Your Criteria
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed">
                Meets all your must-have features and stays within your budget.
              </p>
            </div>
          ) : isError ? (
            <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 text-xs text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-red-400">
                <ShieldAlert className="w-3 h-3 shrink-0" /> Scraping Failed
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed break-words">
                Failed to extract listing data. You can try deleting and adding it again.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-400">
                <ShieldAlert className="w-3 h-3 shrink-0" /> Why It Didn't Match Perfectly
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed break-words">
                {compromiseText}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Actions Row - Comfortable Mobile Touch Targets */}
      <div className="flex items-center gap-2 pt-3.5 border-t border-zinc-800/80">
        <Link href={`/apartments/${apartment.id}`} className="flex-1">
          <button
            className={`w-full font-bold py-3 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-h-[48px] sm:min-h-[44px] cursor-pointer active:scale-[0.98] ${
              isGreen
                ? 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950 shadow-md shadow-emerald-500/10'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80'
            }`}
          >
            <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.5]" />
            <span>Details</span>
          </button>
        </Link>
        
        <Link href={`/apartments/${apartment.id}/chat`} className="flex-1">
          <button
            className={`w-full font-bold py-3 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-h-[48px] sm:min-h-[44px] cursor-pointer active:scale-[0.98] ${
              isGreen
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80'
            }`}
          >
            <MessageCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.5]" />
            <span>Chat</span>
          </button>
        </Link>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete listing"
          className="w-12 h-12 sm:w-11 sm:h-11 min-h-[48px] min-w-[48px] sm:min-h-[44px] sm:min-w-[44px] rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 active:scale-95"
        >
          {isDeleting ? <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />}
        </button>
      </div>
    </div>
  );
}
