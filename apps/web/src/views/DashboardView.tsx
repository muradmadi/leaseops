import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Settings,
  Sparkles,
  ExternalLink,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MessageCircle,
  Clock,
  Search,
  X,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { Link } from 'wouter';
import StageControl, { STAGES } from '../components/StageControl';
import ThreadDigest from '../components/ThreadDigest';
import type { PipelineStage } from '@leaseops/db';
import {
  useApartments,
  useDeleteApartment,
  useSetApartmentActive,
  useSetApartmentStage,
  useSetApartmentAside,
} from '../lib/useApartments';
import {
  boardCounts,
  hasActiveFilters,
  listingHost,
  matchesFilters,
  neighborhoodOptions,
  readListingFacts,
  sortListings,
  stageCounts,
  NO_FILTERS,
  SORT_OPTIONS,
  type BoardCounts,
  type BoardFilters,
  type NeighborhoodOption,
  type SortKey,
} from '../lib/board';
import type { Apartment, ApartmentWithThread } from '@leaseops/db';
import AddListingModal from '../components/AddListingModal';

/**
 * The board is only worth organising once it is bigger than a single desktop
 * row. Below that a search field and four filters are more furniture than the
 * listings they would organise.
 */
const CONTROLS_APPEAR_ABOVE = 3;

export default function DashboardView() {

  const { data: apartments = [], isLoading: isApartmentsLoading } = useApartments();
  const deleteApartmentMutation = useDeleteApartment();
  const setActiveMutation = useSetApartmentActive();
  const setStageMutation = useSetApartmentStage();
  const setAsideMutation = useSetApartmentAside();

  // Add Apartment Full-Screen State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('added');

  // A listing you set aside by hand sits in the yellow zone whatever it scored.
  // The score itself is untouched, so the card still shows the real percentage
  // next to your reason for overriding it.
  const isSetAside = (apt: Apartment) => !!apt.setAsideReason?.trim();
  const isQualified = (apt: ApartmentWithThread) => apt.status === 'QUALIFIED' && !isSetAside(apt);

  const counts = boardCounts(apartments);
  const hoods = neighborhoodOptions(apartments);
  const stageCountMap = stageCounts(apartments);
  const stages = STAGES.filter((stage) => (stageCountMap.get(stage.value) ?? 0) > 0).map((stage) => ({
    value: stage.value as PipelineStage,
    label: stage.label as string,
    count: stageCountMap.get(stage.value) ?? 0,
  }));

  // A filter can outlive the thing it names: archive the last Kreuzberg listing
  // and the board would show nothing, from a control that no longer offers the
  // value it is set to. Fall back to unfiltered rather than to a blank screen.
  const active: BoardFilters = {
    ...filters,
    neighborhood: hoods.some((hood) => hood.key === filters.neighborhood) ? filters.neighborhood : null,
    stage: stages.some((stage) => stage.value === filters.stage) ? filters.stage : null,
  };
  const filtering = hasActiveFilters(active);

  const visible = filtering ? apartments.filter((apt) => matchesFilters(apt, active)) : apartments;

  const meetingCriteriaTotal = apartments.filter(isQualified).length;
  const meetingCriteriaList = sortListings(visible.filter(isQualified), sort);
  const didNotMatchPerfectlyList = sortListings(visible.filter((apt) => !isQualified(apt)), sort);
  const didNotMatchPerfectlyTotal = apartments.length - meetingCriteriaTotal;

  // Kept visible while a filter is set even on a board that has shrunk below the
  // threshold, so a filter can always be cleared by the control that set it.
  const showControls = apartments.length > CONTROLS_APPEAR_ABOVE || filtering;

  const formatPrice = (price: number, currency: string) => {
    try {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(price);
    } catch {
      return `${price} ${currency}`;
    }
  };

  const cardProps = (apt: ApartmentWithThread) => ({
    apartment: apt,
    formatPrice,
    onDelete: () => deleteApartmentMutation.mutate(apt.id),
    isDeleting: deleteApartmentMutation.isPending && deleteApartmentMutation.variables === apt.id,
    onActivate: () => setActiveMutation.mutate({ id: apt.id, isActive: true }),
    onStageChange: (pipelineStage: PipelineStage) => setStageMutation.mutate({ id: apt.id, pipelineStage }),
    onSetAside: (reason: string | null) => setAsideMutation.mutate({ id: apt.id, reason }),
    isActivating: setActiveMutation.isPending && setActiveMutation.variables?.id === apt.id,
  });

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

        {showControls && (
          <BoardControls
            counts={counts}
            shown={visible.length}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            hoods={hoods}
            stages={stages}
            filtering={filtering}
          />
        )}

        {/* SECTION 1: MEETING CRITERIA */}
        <BoardSection
          tone="emerald"
          title="Meeting Criteria"
          shown={meetingCriteriaList.length}
          total={meetingCriteriaTotal}
          filtering={filtering}
          isLoading={isApartmentsLoading}
          loadingLabel="Loading your apartments..."
          onClearFilters={() => setFilters(NO_FILTERS)}
          emptyState={
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
          }
        >
          {meetingCriteriaList.map((apt) => (
            <ApartmentCard key={apt.id} {...cardProps(apt)} zone="green" />
          ))}
        </BoardSection>

        {/* SECTION 2: NOT PERFECTLY MEETING CRITERIA */}
        <BoardSection
          tone="amber"
          title="Not Perfectly Meeting Criteria"
          shown={didNotMatchPerfectlyList.length}
          total={didNotMatchPerfectlyTotal}
          filtering={filtering}
          isLoading={isApartmentsLoading}
          loadingLabel="Loading imperfect matches..."
          onClearFilters={() => setFilters(NO_FILTERS)}
          emptyState={
            <div className="py-12 sm:py-14 bg-zinc-900/20 border-2 border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3 border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-300 text-base mb-1">No imperfect matches yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
                Apartments that are missing a must-have feature or exceed your budget will appear here so you can decide if it's worth compromising.
              </p>
            </div>
          }
        >
          {didNotMatchPerfectlyList.map((apt) => (
            <ApartmentCard key={apt.id} {...cardProps(apt)} zone="yellow" />
          ))}
        </BoardSection>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-zinc-600 text-xs mt-12">
        LeaseOps — Simple apartment hunting.
      </footer>
    </div>
  );
}

const CHIP = 'shrink-0 min-h-[44px] px-3.5 rounded-xl border text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer active:scale-[0.98]';
const CHIP_IDLE = 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200';
const SELECT = 'appearance-none min-h-[44px] pl-3.5 pr-9 rounded-xl border text-xs font-bold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 [&>option]:bg-zinc-900 [&>option]:text-zinc-200';

/** A native select styled to match the chips, with its own chevron. */
function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative shrink-0">
      {children}
      <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

/**
 * Search, sort, and the state of the board.
 *
 * The counts and the filters are one row on purpose. Every number here is also
 * the control that isolates it — "3 waiting on you" is worth knowing and worth
 * acting on in the same gesture, and a second read-only strip saying the same
 * numbers would cost a phone screen half the listings it can show.
 *
 * Nothing is persisted. A filter that survived a reload would look exactly like
 * a board that had lost its listings.
 */
function BoardControls({
  counts,
  shown,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  hoods,
  stages,
  filtering,
}: {
  counts: BoardCounts;
  shown: number;
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  hoods: NeighborhoodOption[];
  stages: { value: PipelineStage; label: string; count: number }[];
  filtering: boolean;
}) {
  const set = (patch: Partial<BoardFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search title or neighbourhood"
            aria-label="Search listings"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-blue-500 rounded-xl pl-10 pr-10 min-h-[44px] text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          {filters.search !== '' && (
            <button
              type="button"
              onClick={() => set({ search: '' })}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <SelectShell>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            aria-label="Sort listings"
            className={`${SELECT} bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SelectShell>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 min-h-[44px] px-3.5 rounded-xl border border-zinc-800/70 bg-zinc-900/40 text-xs font-bold font-mono text-zinc-500 flex items-center whitespace-nowrap">
          {filtering ? `${shown} of ${counts.total}` : `${counts.total} listings`}
        </span>

        {counts.waitingOnYou > 0 && (
          <button
            type="button"
            aria-pressed={filters.waitingOnYou}
            onClick={() => set({ waitingOnYou: !filters.waitingOnYou })}
            className={`${CHIP} ${
              filters.waitingOnYou
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : CHIP_IDLE
            }`}
          >
            <span className="font-mono">{counts.waitingOnYou}</span> waiting on you
          </button>
        )}

        {counts.active > 0 && (
          <button
            type="button"
            aria-pressed={filters.active}
            onClick={() => set({ active: !filters.active })}
            className={`${CHIP} ${
              filters.active ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' : CHIP_IDLE
            }`}
          >
            <span className="font-mono">{counts.active}</span> being chased
          </button>
        )}

        {stages.length > 1 && (
          <SelectShell>
            <select
              value={filters.stage ?? ''}
              onChange={(e) => set({ stage: (e.target.value || null) as PipelineStage | null })}
              aria-label="Filter by pipeline stage"
              className={`${SELECT} ${
                filters.stage
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <option value="">Any stage</option>
              {stages.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label} ({stage.count})
                </option>
              ))}
            </select>
          </SelectShell>
        )}

        {/* Neighbourhoods are free text. One of them is not a choice. */}
        {hoods.length > 1 && (
          <SelectShell>
            <select
              value={filters.neighborhood ?? ''}
              onChange={(e) => set({ neighborhood: e.target.value || null })}
              aria-label="Filter by neighbourhood"
              className={`${SELECT} ${
                filters.neighborhood
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <option value="">Any neighbourhood</option>
              {hoods.map((hood) => (
                <option key={hood.key} value={hood.key}>
                  {hood.label} ({hood.count})
                </option>
              ))}
            </select>
          </SelectShell>
        )}

        {filtering && (
          <button
            type="button"
            onClick={() => onFiltersChange(NO_FILTERS)}
            className={`${CHIP} bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700`}
          >
            <X className="w-3.5 h-3.5 shrink-0" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One zone of the board.
 *
 * `total` is the zone's real size and `shown` is what survived the filters, so
 * an empty zone can say which of the two things happened: you have nothing here
 * yet, or nothing here matches what you asked for. Those need different words
 * and, in the first case, a button.
 */
function BoardSection({
  tone,
  title,
  shown,
  total,
  filtering,
  isLoading,
  loadingLabel,
  emptyState,
  onClearFilters,
  children,
}: {
  tone: 'emerald' | 'amber';
  title: string;
  shown: number;
  total: number;
  filtering: boolean;
  isLoading: boolean;
  loadingLabel: string;
  emptyState: React.ReactNode;
  onClearFilters: () => void;
  children: React.ReactNode;
}) {
  const isEmerald = tone === 'emerald';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3 h-3 rounded-full ${
              isEmerald
                ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
            }`}
          />
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
            {title}
          </h2>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono shrink-0">
          {filtering ? `${shown} of ${total}` : `${total} ${total === 1 ? 'Listing' : 'Listings'}`}
        </span>
      </div>

      {isLoading ? (
        <div className="py-12 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl flex flex-col items-center justify-center text-zinc-500">
          <Loader2 className={`w-8 h-8 animate-spin mb-2 ${isEmerald ? 'text-emerald-500' : 'text-amber-500'}`} />
          <p className="text-sm">{loadingLabel}</p>
        </div>
      ) : total === 0 ? (
        emptyState
      ) : shown === 0 ? (
        <div className="py-10 bg-zinc-900/20 border-2 border-dashed border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/60 flex items-center justify-center text-zinc-400 mb-3 border border-zinc-700/50">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-zinc-300 text-base mb-1">
            None of these {total} match what you asked for
          </h3>
          <button
            onClick={onClearFilters}
            className="mt-3 text-sm font-bold px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 transition-all min-h-[48px] cursor-pointer active:scale-[0.98]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">{children}</div>
      )}
    </section>
  );
}

/**
 * Individual Apartment Card Component.
 * Styled dynamically based on whether it resides in the Green Zone or Yellow Zone.
 *
 * The whole card opens the listing, via an overlay link the content sits on top
 * of. That is what pays for the facts line below the title: the card is a thing
 * you read and tap, not a frame around three buttons.
 */
function ApartmentCard({
  apartment,
  formatPrice,
  onDelete,
  isDeleting,
  onActivate,
  isActivating,
  onStageChange,
  onSetAside,
  zone,
}: {
  apartment: ApartmentWithThread;
  formatPrice: (price: number, currency: string) => string;
  onDelete: () => void;
  isDeleting: boolean;
  onActivate: () => void;
  isActivating: boolean;
  onStageChange: (stage: PipelineStage) => void;
  onSetAside: (reason: string | null) => void;
  zone: 'green' | 'yellow';
}) {
  const isGreen = zone === 'green';
  const isError = apartment.status === 'ERROR';
  const setAsideReason = apartment.setAsideReason?.trim() || '';
  const [reasonDraft, setReasonDraft] = useState('');
  const [isWritingReason, setIsWritingReason] = useState(false);
  const score = apartment.mcdaScore ?? 0;
  const isUnprocessed = apartment.status === 'UNPROCESSED';
  const isActive = apartment.isActive;
  // Activation is offered on anything that fell short but is otherwise usable —
  // that is the pile you dig through when too little is qualifying.
  const canActivate = !isGreen && !isError && !isUnprocessed && !isActive;

  // What you actually compare two flats on, and the reason this line exists.
  // Every part is omitted when the listing does not carry it. A short line is a
  // listing that stated less; a filled-in one would read as a measurement.
  const facts = readListingFacts(apartment);
  const factLine = [
    facts.location,
    facts.areaSqm !== null ? `${facts.areaSqm} m²` : null,
    facts.rooms !== null ? `${facts.rooms} ${facts.rooms === 1 ? 'room' : 'rooms'}` : null,
    facts.pricePerSqm !== null
      ? `${formatPrice(Math.round(facts.pricePerSqm), apartment.currency)}/m²`
      : null,
  ].filter((part): part is string => part !== null);

  // Null for a listing entered by hand with no URL, which is stored as
  // `manual:<id>` — a valid URL with an empty host, which used to render as a
  // link icon pointing at nothing.
  const host = listingHost(apartment.url);

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
      {/* The card face. Everything interactive below sits on z-20, above this. */}
      <Link
        href={`/apartments/${apartment.id}`}
        className="absolute inset-0 z-10 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <span className="sr-only">Open {apartment.title}</span>
      </Link>

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

          <div className="flex items-center gap-2 shrink-0">
            {isActive && !isGreen && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-[10px] font-extrabold uppercase tracking-wider border border-blue-500/30">
                <Sparkles className="w-3 h-3" /> Active
              </span>
            )}
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-zinc-100 font-mono text-right break-words">
              {formatPrice(apartment.price, apartment.currency)}
            </span>
          </div>
        </div>

        {/* Title, the facts you compare on, and where the listing came from. */}
        <div className="mb-4 space-y-1.5">
          <h3 className="font-bold text-zinc-100 text-base sm:text-lg leading-snug break-words group-hover:text-blue-400 transition-colors">
            {apartment.title}
          </h3>

          {factLine.length > 0 && (
            <p className="text-xs text-zinc-400 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
              {factLine.map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <span className="text-zinc-700" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span>{part}</span>
                </React.Fragment>
              ))}
            </p>
          )}

          {host && (
            <a
              href={apartment.url}
              target="_blank"
              rel="noreferrer"
              className="relative z-20 text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 w-fit transition-colors py-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="break-all">{host}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>

        {/* Where this listing actually stands with the landlord. Replaces a prose
            restatement of the score, which the percentage above already says. */}
        <div className="mb-5">
          {isUnprocessed ? (
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
              <span className="leading-relaxed">Scoring against your profile...</span>
            </div>
          ) : isError ? (
            <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 text-xs text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-red-400">
                <ShieldAlert className="w-3 h-3 shrink-0" /> Could Not Score
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed break-words">
                Something went wrong evaluating this listing. Edit it to try again.
              </p>
            </div>
          ) : (
            <>
              <div className="relative z-20">
                <StageControl stage={apartment.pipelineStage} onChange={onStageChange} />
              </div>
              {/* The stage above is what you declared; this is what the thread
                  can prove. Shown together so a stale stage is visible. */}
              <ThreadDigest thread={apartment.thread} />
            </>
          )}

          {/* Your judgement, kept beside the score rather than replacing it. */}
          {setAsideReason && (
            <div className="relative z-20 mt-2.5 p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-400">
                <ShieldAlert className="w-3 h-3 shrink-0" /> Set aside by you
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed break-words">{setAsideReason}</p>
              <button
                type="button"
                onClick={() => onSetAside(null)}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer min-h-[44px] flex items-center"
              >
                Return it to the qualified pile
              </button>
            </div>
          )}

          {isWritingReason && !setAsideReason && (
            <div className="relative z-20 mt-2.5 space-y-2">
              <textarea
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                autoFocus
                rows={2}
                maxLength={300}
                placeholder="Why are you setting this aside?"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/60 rounded-xl px-3 py-2.5 text-[16px] sm:text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!reasonDraft.trim()}
                  onClick={() => {
                    onSetAside(reasonDraft.trim());
                    setIsWritingReason(false);
                    setReasonDraft('');
                  }}
                  className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Set aside
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWritingReason(false);
                    setReasonDraft('');
                  }}
                  className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Only offered where it means something: a listing the score put in
              the green zone that you disagree with. */}
          {isGreen && !setAsideReason && !isWritingReason && (
            <button
              type="button"
              onClick={() => setIsWritingReason(true)}
              className="relative z-20 mt-2.5 text-[11px] font-bold text-zinc-500 hover:text-amber-400 cursor-pointer min-h-[44px] flex items-center transition-colors"
            >
              Set aside with a reason
            </button>
          )}
        </div>
      </div>

      {canActivate && (
        <button
          onClick={onActivate}
          disabled={isActivating}
          className="relative z-20 w-full mb-2.5 font-bold py-3 px-3 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 min-h-[48px] sm:min-h-[44px] cursor-pointer active:scale-[0.98] bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20 disabled:opacity-50"
        >
          {isActivating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Analysing &amp; drafting...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span>Activate &amp; analyse</span>
            </>
          )}
        </button>
      )}

      {/* Bottom Actions Row. Details is gone — the card is the link. Archiving
          stays, quietly: the detail view has no way to do it. */}
      <div className="relative z-20 flex items-center gap-2 pt-3.5 border-t border-zinc-800/80">
        <Link href={`/apartments/${apartment.id}/chat`} className="flex-1">
          <button
            className={`w-full font-bold py-3 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 sm:gap-2 min-h-[48px] sm:min-h-[44px] cursor-pointer active:scale-[0.98] ${
              isGreen
                ? 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950 shadow-md shadow-emerald-500/10'
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
          aria-label="Archive listing"
          title="Archive listing — recoverable from Settings"
          className="w-12 h-12 sm:w-11 sm:h-11 min-h-[48px] min-w-[48px] sm:min-h-[44px] sm:min-w-[44px] rounded-xl bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 active:scale-95"
        >
          {isDeleting ? <Loader2 className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />}
        </button>
      </div>
    </div>
  );
}
