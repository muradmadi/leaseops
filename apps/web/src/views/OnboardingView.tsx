import React, { useState, useEffect } from 'react';
import { 
  Check, 
  Sliders, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw, 
  Zap,
  Building,
  Languages,
  Ruler,
  AlertCircle,
  Briefcase,
  Calendar,
  Users,
  HeartHandshake,
  FileText,
  FileSignature,
  ShieldCheck,
  FolderCheck,
  CalendarClock,
  Clock,
  X,
  CheckCircle2
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useProfile, useUpdateProfile } from '../lib/useProfile';
import { useHousehold } from '../lib/useHousehold';
import { PREFERENCE_CATEGORIES, getDefaultFeatureWeights } from '../lib/preferenceMatrixData';

export default function OnboardingView() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading } = useProfile();
  const updateProfileMutation = useUpdateProfile();

  // Wizard Step State (1: Location & Logistics, 2: Financials, 3: Matrix Explained, 4: Preference Matrix, 5: Tenant Persona, 6: Summary)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number>(0);

  // Form State - General & Logistics
  const [targetLocation, setTargetLocation] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>('English');
  const [currency, setCurrency] = useState<string>('EUR');
  const [idealRent, setIdealRent] = useState<number>(1200);
  const [maxRent, setMaxRent] = useState<number>(1500);
  const [qualifyingThreshold, setQualifyingThreshold] = useState<number>(70);
  const [weights, setWeights] = useState<Record<string, number>>(getDefaultFeatureWeights());

  // Preview only, and computed by the API so it cannot disagree with the
  // signature the draft actually gets. Follows the language selected right now,
  // even before it is saved.
  const { data: household } = useHousehold(targetLanguage);
  const derivedSignOff = household?.signOff ?? '';

  // Form State - Tenant Persona Bio Questions (Assembled into JSON at end of onboarding)
  // These start empty on purpose. Pre-filling them with sample biography would put
  // invented facts about the user into their outreach messages the moment they hit
  // Save — see the no-fabrication rule in CLAUDE.md. Each field has a placeholder
  // showing the expected shape instead.
  const [bioProfession, setBioProfession] = useState<string>('');
  const [bioTimeline, setBioTimeline] = useState<string>('');
  const [bioHousehold, setBioHousehold] = useState<string>('');
  const [bioPets, setBioPets] = useState<string>('');
  const [bioNotes, setBioNotes] = useState<string>('');
  const [bioContract, setBioContract] = useState<string>('');
  const [bioGuarantees, setBioGuarantees] = useState<string>('');
  const [bioDocuments, setBioDocuments] = useState<string>('');
  const [bioLeaseLength, setBioLeaseLength] = useState<string>('');
  const [bioViewing, setBioViewing] = useState<string>('');

  // Requirements with a natural unit, kept as figures rather than 1-5 weights.
  const [sizeMin, setSizeMin] = useState<string>('');
  const [sizeMax, setSizeMax] = useState<string>('');
  const [bedroomsMin, setBedroomsMin] = useState<string>('');
  const [bedroomsIdeal, setBedroomsIdeal] = useState<string>('');
  const [bathroomsMin, setBathroomsMin] = useState<string>('');
  const [bathroomsIdeal, setBathroomsIdeal] = useState<string>('');

  // Scroll to top whenever step or category changes to prevent vertical jumping
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step, activeCategoryIndex]);

  // Initialize state once profile loads from DB
  useEffect(() => {
    if (profile) {
      if (profile.targetLocation) setTargetLocation(profile.targetLocation);
      if (profile.targetLanguage) setTargetLanguage(profile.targetLanguage);
      if (profile.currency) setCurrency(profile.currency);
      if (profile.idealRent) setIdealRent(profile.idealRent);
      if (profile.maxRent) setMaxRent(profile.maxRent);
      if (profile.qualifyingThreshold) setQualifyingThreshold(profile.qualifyingThreshold);
      const space = profile.spaceRequirements || {};
      const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
      setSizeMin(num(space.floorSizeSqm?.min));
      setSizeMax(num(space.floorSizeSqm?.max));
      setBedroomsMin(num(space.bedrooms?.minimum));
      setBedroomsIdeal(num(space.bedrooms?.ideal));
      setBathroomsMin(num(space.bathrooms?.minimum));
      setBathroomsIdeal(num(space.bathrooms?.ideal));

      if (profile.featureWeights && Object.keys(profile.featureWeights).length > 0) {
        setWeights((prev) => ({ ...prev, ...profile.featureWeights }));
      }
      if (profile.tenantPersona) {
        try {
          const parsed = JSON.parse(profile.tenantPersona);
          if (parsed.professionAndIncome !== undefined) setBioProfession(parsed.professionAndIncome);
          if (parsed.moveInTimeline !== undefined) setBioTimeline(parsed.moveInTimeline);
          if (parsed.householdComposition !== undefined) setBioHousehold(parsed.householdComposition);
          if (parsed.pets !== undefined) setBioPets(parsed.pets);
          if (parsed.additionalNotes !== undefined) setBioNotes(parsed.additionalNotes);
          if (parsed.contractType !== undefined) setBioContract(parsed.contractType);
          if (parsed.financialGuarantees !== undefined) setBioGuarantees(parsed.financialGuarantees);
          if (parsed.documentsReady !== undefined) setBioDocuments(parsed.documentsReady);
          if (parsed.intendedLeaseLength !== undefined) setBioLeaseLength(parsed.intendedLeaseLength);
          if (parsed.viewingAvailability !== undefined) setBioViewing(parsed.viewingAvailability);
        } catch {
          // Older profiles hold plain prose rather than the structured JSON that
          // onboarding writes. Keep it as free-form notes; the remaining fields
          // stay empty rather than being filled with something the user never said.
          setBioNotes(profile.tenantPersona);
        }
      }
    }
  }, [profile]);

  const handleWeightChange = (featureId: string, val: number) => {
    setWeights((prev) => ({ ...prev, [featureId]: val }));
  };

  const handleResetCategory = (catIndex: number) => {
    const cat = PREFERENCE_CATEGORIES[catIndex];
    if (!cat) return;
    const updated = { ...weights };
    for (const feat of cat.features) {
      updated[feat.id] = 3;
    }
    setWeights(updated);
  };

  /** Blank stays blank: an unanswered figure is not the same as zero. */
  const toNumberOrNull = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const getTenantPersonaJson = () => {
    return JSON.stringify(
      {
        professionAndIncome: bioProfession,
        moveInTimeline: bioTimeline,
        householdComposition: bioHousehold,
        pets: bioPets,
        contractType: bioContract,
        financialGuarantees: bioGuarantees,
        documentsReady: bioDocuments,
        intendedLeaseLength: bioLeaseLength,
        viewingAvailability: bioViewing,
        additionalNotes: bioNotes,
      },
      null,
      2
    );
  };

  const handleSaveAndEnterPipeline = async () => {
    await updateProfileMutation.mutateAsync({
      targetLocation,
      targetLanguage,
      currency,
      idealRent: Number(idealRent) || 1200,
      maxRent: Number(maxRent) || 1500,
      qualifyingThreshold: Number(qualifyingThreshold) || 70,
      featureWeights: weights,
      spaceRequirements: {
        floorSizeSqm: { min: toNumberOrNull(sizeMin), max: toNumberOrNull(sizeMax) },
        bedrooms: { minimum: toNumberOrNull(bedroomsMin), ideal: toNumberOrNull(bedroomsIdeal) },
        bathrooms: { minimum: toNumberOrNull(bathroomsMin), ideal: toNumberOrNull(bathroomsIdeal) },
      },
      tenantPersona: getTenantPersonaJson(),
    });
    setLocation('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-zinc-400 animate-pulse">Loading RevOps Onboarding Profile...</p>
      </div>
    );
  }

  const activeCategory = PREFERENCE_CATEGORIES[activeCategoryIndex] || PREFERENCE_CATEGORIES[0];
  const totalDealbreakers = Object.values(weights).filter((w) => w === 5).length;
  const totalHighPriority = Object.values(weights).filter((w) => w === 4).length;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-emerald-500/20 selection:text-emerald-400 font-sans relative overflow-x-hidden">
      {/* Top Progress Line */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500 transition-all duration-500"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </div>

      {/* Minimal Universal Top Header */}
      <header className="px-6 py-4 sm:py-5 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-extrabold text-sm font-mono shadow-inner shrink-0">
            {step}
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 block font-mono">
              Step {step} of 6
            </span>
            <h1 className="text-base sm:text-lg font-extrabold text-zinc-100 tracking-tight leading-snug mt-0.5 break-words">
              {step === 1 && 'Location & Communication'}
              {step === 2 && 'Budget & Space'}
              {step === 3 && 'Matrix Explained'}
              {step === 4 && 'Preference Matrix'}
              {step === 5 && 'Tenant Outreach Bio'}
              {step === 6 && 'Pipeline Review'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {step === 4 && (
            <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800 shrink-0">
              {activeCategoryIndex + 1} out of {PREFERENCE_CATEGORIES.length}
            </span>
          )}
          {/* No way out on a first run: without criteria there is no pipeline to
              exit to, and the dashboard would score listings against defaults the
              user never chose. Once a profile exists this is an ordinary edit. */}
          {profile?.exists && (
            <Link href="/">
              <button title="Exit to Pipeline" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </Link>
          )}
        </div>
      </header>

      {/* Main Full-Screen Content Area - Top aligned to prevent vertical jumping */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 sm:px-8 py-4 sm:py-6 flex flex-col justify-start">
        {/* SCREEN 1: Location & Communication Logistics */}
        {step === 1 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2 sm:space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-4 h-4 text-emerald-400" />
                Where are you looking to rent?
              </label>
              <input
                type="text"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                placeholder="e.g., Berlin, Mitte or Paris 11e Arrondissement"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-emerald-500/60 focus:bg-zinc-900 rounded-2xl px-4 py-3.5 sm:py-3 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[52px] sm:min-h-[48px]"
              />
            </div>

            <div className="space-y-2 sm:space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Languages className="w-4 h-4 text-blue-400" />
                Primary local language of target location
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 focus:bg-zinc-900 rounded-2xl px-4 py-3.5 sm:py-3 text-[16px] sm:text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px] sm:min-h-[48px] cursor-pointer"
              >
                <option value="English">English</option>
                <option value="German">German (Deutsch)</option>
                <option value="Spanish">Spanish (Español)</option>
                <option value="French">French (Français)</option>
                <option value="Italian">Italian (Italiano)</option>
                <option value="Portuguese">Portuguese (Português)</option>
                <option value="Dutch">Dutch (Nederlands)</option>
                <option value="Japanese">Japanese (日本語)</option>
                <option value="Swedish">Swedish (Svenska)</option>
              </select>
            </div>

          </div>
        )}

        {/* SCREEN 2: Financial Boundaries */}
        {step === 2 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2 sm:space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                Preferred Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full sm:w-1/2 bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-emerald-500/60 focus:bg-zinc-900 rounded-2xl px-4 py-3.5 sm:py-3 text-[16px] sm:text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[52px] sm:min-h-[48px] cursor-pointer"
              >
                <option value="EUR">EUR (€) — Euro</option>
                <option value="USD">USD ($) — US Dollar</option>
                <option value="GBP">GBP (£) — British Pound</option>
                <option value="CHF">CHF (CHF) — Swiss Franc</option>
                <option value="CAD">CAD ($) — Canadian Dollar</option>
                <option value="AUD">AUD ($) — Australian Dollar</option>
                <option value="JPY">JPY (¥) — Japanese Yen</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-2">
              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-5 sm:p-6 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Ideal Monthly Rent
                  </label>
                  <span className="text-xs font-mono text-zinc-500">Sweet Spot</span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-zinc-400 font-bold text-lg">
                    {currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'JPY' ? '¥' : '$'}
                  </span>
                  <input
                    type="number"
                    value={idealRent}
                    onChange={(e) => setIdealRent(Number(e.target.value))}
                    className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3.5 text-xl font-extrabold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[52px]"
                  />
                </div>
              </div>

              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-5 sm:p-6 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Max Rent Ceiling
                  </label>
                  <span className="text-xs font-mono text-zinc-500">Hard Limit</span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-zinc-400 font-bold text-lg">
                    {currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'JPY' ? '¥' : '$'}
                  </span>
                  <input
                    type="number"
                    value={maxRent}
                    onChange={(e) => setMaxRent(Number(e.target.value))}
                    className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3.5 text-xl font-extrabold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 min-h-[52px]"
                  />
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-5 sm:p-6 rounded-2xl space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  Qualifying score
                </label>
                <span className="text-xs font-mono text-zinc-500">Pass mark</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={40}
                  max={95}
                  step={1}
                  value={qualifyingThreshold}
                  onChange={(e) => setQualifyingThreshold(Number(e.target.value))}
                  className="flex-1 h-2 accent-blue-500 cursor-pointer"
                />
                <span className="text-xl font-extrabold text-zinc-100 font-mono w-16 text-right">
                  {qualifyingThreshold}%
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                A listing needs this score to land in Meeting Criteria. Lower it if too
                little is getting through; raise it if you are drowning in matches. You can
                still pursue anything that falls short &mdash; it just will not be presented
                as a match.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-zinc-100 tracking-tight flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-emerald-400" />
                  Space requirements
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  These are figures, not priorities. More floor space is not simply better —
                  past a point it is more to heat, clean and furnish — so give the range that
                  actually works for you. Leave anything blank to say you have no limit.
                </p>
              </div>

              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Floor area (m²)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={sizeMin} onChange={(e) => setSizeMin(e.target.value)}
                    placeholder="40"
                    className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                  />
                  <span className="text-zinc-500 text-sm font-bold shrink-0">to</span>
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={sizeMax} onChange={(e) => setSizeMax(e.target.value)}
                    placeholder="75"
                    className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                  />
                </div>
                {sizeMin !== '' && sizeMax !== '' && Number(sizeMin) > Number(sizeMax) && (
                  <p className="text-xs text-amber-400">Minimum is larger than the maximum.</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-3">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Bedrooms</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-medium">Minimum</span>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={bedroomsMin} onChange={(e) => setBedroomsMin(e.target.value)}
                        placeholder="1"
                        className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-medium">Ideal</span>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={bedroomsIdeal} onChange={(e) => setBedroomsIdeal(e.target.value)}
                        placeholder="2"
                        className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-3">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Bathrooms</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-medium">Minimum</span>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={bathroomsMin} onChange={(e) => setBathroomsMin(e.target.value)}
                        placeholder="1"
                        className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-[11px] text-zinc-500 font-medium">Ideal</span>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={bathroomsIdeal} onChange={(e) => setBathroomsIdeal(e.target.value)}
                        placeholder="1"
                        className="w-full bg-zinc-950 sm:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-3 text-[16px] sm:text-sm font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SCREEN 3: Preference Matrix Explained */}
        {step === 3 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
                How The Preference Matrix Works
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                We use mathematical Multi-Criteria Decision Analysis (MCDA) to automatically score and rank incoming property listings against your non-negotiables.
              </p>
            </div>

            <div className="space-y-3 sm:space-y-3.5">
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-extrabold text-base shrink-0 mt-0.5 font-mono">
                  1-3
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Not Scored (Low to Neutral)</h3>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Not scored at all. Anything you weight 1&ndash;3 is recorded but left out of the calculation, so the score reflects only what you said matters.
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-extrabold text-base shrink-0 mt-0.5 font-mono">
                  4
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">High Priority Multipliers</h3>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Scored and compensatory: a strong result here can offset a weaker one elsewhere, and vice versa.
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.08)] flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-extrabold text-base shrink-0 mt-0.5 font-mono">
                  5
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-amber-300">Hard Dealbreakers</h3>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 fill-amber-400" />
                      <span>Strict</span>
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Scored, and heavily penalised when missed. Rating one below 3/5 cuts the whole score by up to 45%, which almost always drops a listing out &mdash; but it is still scored and still shown, with the reason and the exact points lost, rather than disappearing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 4: The Preference Matrix */}
        {step === 4 && (
          <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900/80 pb-3">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-zinc-100 tracking-tight flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{activeCategory.title}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => handleResetCategory(activeCategoryIndex)}
                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 self-start sm:self-center font-mono cursor-pointer py-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset category to neutral
              </button>
            </div>

            {/* Compact Category Switcher (A through F) */}
            <div
              className="grid gap-1.5 bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-800/80"
              style={{ gridTemplateColumns: `repeat(${PREFERENCE_CATEGORIES.length}, minmax(0, 1fr))` }}
            >
              {PREFERENCE_CATEGORIES.map((cat, idx) => {
                // Derived from the data, not a fixed list — adding a category must
                // not silently fall back to showing a number.
                const letter = String.fromCharCode(65 + idx);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryIndex(idx)}
                    className={`py-2.5 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer font-mono ${
                      activeCategoryIndex === idx
                        ? 'bg-blue-500 text-white shadow-md scale-[1.02]'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            {/* Feature Evaluation List */}
            <div className="space-y-2 sm:space-y-2.5">
              {activeCategory.features.map((feat) => {
                const currentVal = weights[feat.id] || 3;
                const isDealbreaker = currentVal === 5;

                return (
                  <div
                    key={feat.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${
                      isDealbreaker
                        ? 'bg-zinc-900/90 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                        : 'bg-zinc-900/50 sm:bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between sm:justify-start gap-2 pr-1">
                      <span className="text-sm sm:text-base font-bold text-zinc-100 leading-snug break-words">{feat.name}</span>
                      {isDealbreaker && (
                        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 fill-amber-400" />
                          <span>Dealbreaker</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-0.5 sm:pt-0">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleWeightChange(feat.id, val)}
                          title={
                            val === 1 ? 'Not Important' : val === 3 ? 'Neutral' : val === 5 ? 'Dealbreaker' : `Weight ${val}`
                          }
                          className={`flex-1 sm:flex-initial w-auto sm:w-10 h-9 sm:h-10 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer ${
                            currentVal === val
                              ? val === 5
                                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 font-extrabold scale-105'
                                : val === 4
                                ? 'bg-emerald-500 text-zinc-950 font-bold scale-105'
                                : 'bg-blue-500 text-white font-bold scale-105'
                              : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SCREEN 5: Tenant Persona & Bio Questionnaire */}
        {step === 5 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                Profession and income source
              </label>
              <textarea
                rows={3}
                value={bioProfession}
                onChange={(e) => setBioProfession(e.target.value)}
                placeholder="e.g., Senior Software Engineer, remote with verifiable salary"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Target move-in date and timeline
              </label>
              <textarea
                rows={3}
                value={bioTimeline}
                onChange={(e) => setBioTimeline(e.target.value)}
                placeholder="e.g., Immediate / within 30 days. Ready upon inspection."
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                Who will be living in the apartment?
              </label>
              <textarea
                rows={3}
                value={bioHousehold}
                onChange={(e) => setBioHousehold(e.target.value)}
                placeholder="e.g., Single professional adult, quiet lifestyle."
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5 text-amber-400" />
                Pets or smoking habits
              </label>
              <textarea
                rows={3}
                value={bioPets}
                onChange={(e) => setBioPets(e.target.value)}
                placeholder="e.g., No pets, strictly non-smoker."
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>


            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileSignature className="w-3.5 h-3.5 text-emerald-400" />
                Employment contract type and length
              </label>
              <textarea
                rows={3}
                value={bioContract}
                onChange={(e) => setBioContract(e.target.value)}
                placeholder="e.g., Permanent contract (indefinido), 3 years with current employer"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Financial guarantees you can offer
              </label>
              <textarea
                rows={3}
                value={bioGuarantees}
                onChange={(e) => setBioGuarantees(e.target.value)}
                placeholder="e.g., Guarantor available, or 2 months deposit plus 1 month upfront"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <FolderCheck className="w-3.5 h-3.5 text-purple-400" />
                Documents you can provide immediately
              </label>
              <textarea
                rows={3}
                value={bioDocuments}
                onChange={(e) => setBioDocuments(e.target.value)}
                placeholder="e.g., Last 3 payslips, employment contract, tax return, passport/NIE"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                How long you intend to stay
              </label>
              <textarea
                rows={3}
                value={bioLeaseLength}
                onChange={(e) => setBioLeaseLength(e.target.value)}
                placeholder="e.g., Looking for a minimum of 2–3 years, happy to sign long"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                When you can view the property
              </label>
              <textarea
                rows={3}
                value={bioViewing}
                onChange={(e) => setBioViewing(e.target.value)}
                placeholder="e.g., Weekday evenings after 18:00 and any time at weekends"
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                Additional strengths or notes
              </label>
              <textarea
                rows={4}
                value={bioNotes}
                onChange={(e) => setBioNotes(e.target.value)}
                placeholder="e.g., Excellent credit score (800+), landlord references ready."
                className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[110px] sm:min-h-[130px] leading-relaxed resize-y"
              />
            </div>
          </div>
        )}

        {/* SCREEN 6: Completion Summary & Pipeline Review */}
        {step === 6 && (
          <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-1.5">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block">1. Search & Language</span>
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-zinc-100 break-words pr-2">{targetLocation || 'Global Search'}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 shrink-0">
                    {targetLanguage}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Outreach is drafted automatically for every qualified lead.
                </p>
              </div>

              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-1.5">
                <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider block">2. Budget Ceilings</span>
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-zinc-100">
                    {currency} {idealRent} <span className="text-xs text-zinc-500 font-normal">Ideal</span>
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Max {currency} {maxRent}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Listings over {currency} {maxRent} are automatically grayed out.
                </p>
              </div>

              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    3. MCDA Scoring Matrix Summary
                  </span>
                  <span className="text-xs font-mono text-zinc-500">32 Features</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">{totalDealbreakers} Dealbreakers</span>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">{totalHighPriority} High Priority (Weight 4)</span>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/60 sm:bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 rounded-2xl space-y-1.5 sm:col-span-2">
                <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider block">4. Tenant Outreach Profile</span>
                {bioProfession || bioTimeline || bioHousehold || bioPets || bioNotes ? (
                  <>
                    {bioProfession && <p className="text-sm font-semibold text-zinc-200 break-words">{bioProfession}</p>}
                    {(bioTimeline || bioPets) && (
                      <p className="text-xs text-zinc-400 break-words">
                        {bioTimeline && <>Move-in: <span className="text-zinc-300">{bioTimeline}</span></>}
                        {bioTimeline && bioPets && ' • '}
                        {bioPets}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 break-words">
                    Not filled in. Outreach drafts will rely on the listing and your criteria alone —
                    go back to step 5 to add your background.
                  </p>
                )}
                <p className="text-xs text-zinc-400 break-words pt-0.5">
                  Signed off as:{' '}
                  {derivedSignOff ? (
                    <strong className="text-zinc-200">{derivedSignOff}</strong>
                  ) : (
                    <span className="text-amber-400/90">
                      no household names set — drafts will end without a signature
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <footer className="px-6 py-4 sm:py-5 border-t border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky bottom-0 z-40 flex items-center justify-between gap-4 shrink-0">
        {step === 1 ? (
          <div className="w-full flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </button>
          </div>
        ) : step === 2 ? (
          <>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
            >
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </button>
          </>
        ) : step === 3 ? (
          <>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
            >
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </button>
          </>
        ) : step === 4 ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (activeCategoryIndex > 0) {
                  setActiveCategoryIndex(activeCategoryIndex - 1);
                } else {
                  setStep(3);
                }
              }}
              className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
            >
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>Back</span>
            </button>
            {activeCategoryIndex < PREFERENCE_CATEGORIES.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveCategoryIndex(activeCategoryIndex + 1)}
                className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(5)}
                className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
            )}
          </>
        ) : step === 5 ? (
          <>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
            >
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
            >
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAndEnterPipeline}
              disabled={updateProfileMutation.isPending}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-extrabold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>{updateProfileMutation.isPending ? 'Saving...' : 'Save & Enter Pipeline'}</span>
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
