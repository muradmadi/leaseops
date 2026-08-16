import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  X,
  Globe,
  Tag,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Sliders,
  Home,
  Bed,
  Utensils,
  Bath,
  DoorOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useCreateApartment, useUpdateApartmentRatings, useUpdateApartment } from '../lib/useApartments';
import type { Apartment } from '@leaseops/db';
import { useProfile } from '../lib/useProfile';
import { PREFERENCE_CATEGORIES, type PreferenceFeature } from '../lib/preferenceMatrixData';

interface AddListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Pass a listing to edit it instead of creating one. Every field and rating is
   * prefilled from the record and the score is recomputed on save — a viewing
   * routinely invalidates what the advert claimed.
   */
  editing?: Apartment | null;
}

type Step = 1 | 2 | 3 | 4 | 5;

const getGradeBtnClass = (val: number, isSelected: boolean) => {
  if (isSelected) {
    switch (val) {
      case 1:
        return 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/30 scale-105 font-black';
      case 2:
        return 'bg-orange-500 border-orange-300 text-white shadow-lg shadow-orange-500/30 scale-105 font-black';
      case 3:
        return 'bg-yellow-500 border-yellow-300 text-zinc-950 shadow-lg shadow-yellow-500/30 scale-105 font-black';
      case 4:
        return 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/30 scale-105 font-black';
      case 5:
      default:
        return 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 scale-105 font-black';
    }
  }
  switch (val) {
    case 1:
      return 'bg-zinc-950/80 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50';
    case 2:
      return 'bg-zinc-950/80 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/50';
    case 3:
      return 'bg-zinc-950/80 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/50';
    case 4:
      return 'bg-zinc-950/80 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50';
    case 5:
    default:
      return 'bg-zinc-950/80 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50';
  }
};

export default function AddListingModal({ isOpen, onClose, editing }: AddListingModalProps) {
  const isEditing = !!editing;
  const updateApartmentMutation = useUpdateApartment();
  const { data: profile } = useProfile();
  const createApartmentMutation = useCreateApartment();
  const updateRatingsMutation = useUpdateApartmentRatings();

  // Set only when a listing was already created (re-rating an existing one).
  const [createdApartmentId, setCreatedApartmentId] = useState<string | null>(null);

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Screen 1 basics
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [roomsInput, setRoomsInput] = useState('');
  const [bathroomsInput, setBathroomsInput] = useState('');
  const [floorInput, setFloorInput] = useState('');
  const [neighborhoodInput, setNeighborhoodInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Feature ratings (for weight 4 and 5 features)
  const [featureRatings, setFeatureRatings] = useState<Record<string, number>>({});
  const [dealbreakerIndex, setDealbreakerIndex] = useState(0);

  // Room quality scores (1-5 scale)
  const [roomScores, setRoomScores] = useState<Record<string, number>>({
    livingRoom: 3,
    bedroom: 3,
    kitchen: 3,
    bathroom: 3,
    entryway: 3,
  });

  // Extract features by weight from profile
  const { dealbreakerFeatures, highPriorityFeatures } = useMemo(() => {
    const weights = profile?.featureWeights || {};
    const dealbreakers: PreferenceFeature[] = [];
    const highPriorities: PreferenceFeature[] = [];

    PREFERENCE_CATEGORIES.forEach((cat) => {
      cat.features.forEach((feat) => {
        const w = weights[feat.id] !== undefined ? Number(weights[feat.id]) : 3;
        if (w === 5) {
          dealbreakers.push(feat);
        } else if (w === 4) {
          highPriorities.push(feat);
        }
      });
    });

    return { dealbreakerFeatures: dealbreakers, highPriorityFeatures: highPriorities };
  }, [profile]);

  // Prefilled on open rather than in the parent, so the modal owns its own state
  // and cannot be left showing a previous listing's figures.
  //
  // Keyed on the listing *id*, deliberately not on the object. `useApartment`
  // refetches every 3s, so depending on `editing` itself would re-run this on a
  // new object identity every poll and wipe whatever was being typed. Prefilling
  // once per listing per open is the actual intent.
  useEffect(() => {
    if (!isOpen || !editing) return;
    const ext = (editing.extractedData || {}) as any;
    const metrics = ext.unitMetrics || {};
    setUrlInput(editing.url?.startsWith('manual:') ? '' : editing.url || '');
    setTitleInput(editing.title || '');
    setPriceInput(editing.price != null ? String(editing.price) : '');
    setDescriptionInput(ext.description || '');
    setSizeInput(metrics.floorSizeSqm != null ? String(metrics.floorSizeSqm) : '');
    setRoomsInput(metrics.totalRooms != null ? String(metrics.totalRooms) : '');
    setBathroomsInput(metrics.bathrooms != null ? String(metrics.bathrooms) : '');
    // These three live under unitMetrics/location, not at the top level. Reading
    // the wrong path blanked the fields, and saving then wrote the blanks back
    // over real data — a silent delete disguised as an edit.
    setFloorInput(metrics.floorLevel || '');
    setNeighborhoodInput(ext.location?.neighborhood || '');
    setCityInput(ext.location?.city || '');
    setRoomScores({
      livingRoom: 3, bedroom: 3, kitchen: 3, bathroom: 3, entryway: 3,
      ...((editing.roomScores || {}) as Record<string, number>),
    });
    // Ratings come off the stored evaluations, which is where the real values
    // live — the payload that produced them is not kept.
    const evaluations = ((editing.featureScores || {}) as any)?.evaluations || [];
    const ratings: Record<string, number> = {};
    for (const e of evaluations) {
      if (e?.featureId && !String(e.featureId).startsWith('__') && typeof e.rating === 'number') {
        ratings[e.featureId] = e.rating;
      }
    }
    setFeatureRatings(ratings);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing?.id]);

  if (!isOpen) return null;

  /** Blank stays blank — an unentered figure is not zero. */
  const numOrNull = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const handleNextFromStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!titleInput.trim()) {
      setErrorMessage('Give the listing a title so you can recognise it later.');
      return;
    }
    if (numOrNull(priceInput) === null || Number(priceInput) <= 0) {
      setErrorMessage('Enter the monthly rent — the budget check needs a real figure.');
      return;
    }

    // Nothing is created yet. The listing is saved once, at the end, with your
    // ratings included, so it is never scored twice or shown mid-evaluation.
    if (dealbreakerFeatures.length > 0) {
      setDealbreakerIndex(0);
      setStep(2);
    } else if (highPriorityFeatures.length > 0) {
      setStep(3);
    } else {
      setStep(4);
    }
  };


  const handlePrevFromDealbreakers = () => {
    if (dealbreakerIndex > 0) {
      setDealbreakerIndex((prev) => prev - 1);
    } else {
      setStep(1);
    }
  };

  const handleNextFromDealbreakers = () => {
    if (dealbreakerIndex < dealbreakerFeatures.length - 1) {
      setDealbreakerIndex((prev) => prev + 1);
    } else if (highPriorityFeatures.length > 0) {
      setStep(3);
    } else {
      setStep(4);
    }
  };

  const handleNextFromHighPriorities = () => {
    setStep(4);
  };

  const handlePrevFromHighPriorities = () => {
    if (dealbreakerFeatures.length > 0) {
      setDealbreakerIndex(dealbreakerFeatures.length - 1);
      setStep(2);
    } else {
      setStep(1);
    }
  };

  const handlePrevFromRooms = () => {
    if (highPriorityFeatures.length > 0) {
      setStep(3);
    } else if (dealbreakerFeatures.length > 0) {
      setDealbreakerIndex(dealbreakerFeatures.length - 1);
      setStep(2);
    } else {
      setStep(1);
    }
  };

  const handleCloseModal = () => {
    setUrlInput('');
    setTitleInput('');
    setPriceInput('');
    setDescriptionInput('');
    setSizeInput('');
    setRoomsInput('');
    setBathroomsInput('');
    setFloorInput('');
    setNeighborhoodInput('');
    setCityInput('');
    setErrorMessage('');
    setFeatureRatings({});
    setRoomScores({ livingRoom: 3, bedroom: 3, kitchen: 3, bathroom: 3, entryway: 3 });
    setCreatedApartmentId(null);
    setStep(1);
    onClose();
  };

  const handleSubmitFinal = async () => {
    setErrorMessage('');
    try {
      if (isEditing && editing) {
        await updateApartmentMutation.mutateAsync({
          id: editing.id,
          url: urlInput.trim() || undefined,
          title: titleInput.trim(),
          price: parseFloat(priceInput),
          currency: profile?.currency || 'EUR',
          description: descriptionInput,
          floorSizeSqm: numOrNull(sizeInput),
          totalRooms: numOrNull(roomsInput),
          bathrooms: numOrNull(bathroomsInput),
          floorLevel: floorInput.trim(),
          neighborhood: neighborhoodInput.trim(),
          city: cityInput.trim(),
          featureRatings,
          roomScores,
        });
      } else if (createdApartmentId) {
        await updateRatingsMutation.mutateAsync({
          id: createdApartmentId,
          featureRatings,
          roomScores,
        });
      } else {
        await createApartmentMutation.mutateAsync({
          url: urlInput.trim() || undefined,
          title: titleInput.trim(),
          price: parseFloat(priceInput),
          currency: profile?.currency || 'EUR',
          description: descriptionInput,
          floorSizeSqm: numOrNull(sizeInput),
          totalRooms: numOrNull(roomsInput),
          bathrooms: numOrNull(bathroomsInput),
          floorLevel: floorInput.trim(),
          neighborhood: neighborhoodInput.trim(),
          city: cityInput.trim(),
          featureRatings,
          roomScores,
        });
      }
      if (isEditing) {
        handleCloseModal();
        return;
      }
      setStep(5);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit apartment listing.');
    }
  };


  const setRating = (featureId: string, rating: number) => {
    setFeatureRatings((prev) => ({ ...prev, [featureId]: rating }));
  };

  const setRoomScore = (room: string, score: number) => {
    setRoomScores((prev) => ({ ...prev, [room]: score }));
  };

  // Determine current progress percentage
  const totalSteps = 1 + (dealbreakerFeatures.length > 0 ? 1 : 0) + (highPriorityFeatures.length > 0 ? 1 : 0) + 1;
  let currentStepNum = 1;
  if (step === 2) currentStepNum = 2;
  if (step === 3) currentStepNum = 2 + (dealbreakerFeatures.length > 0 ? 1 : 0);
  if (step === 4 || step === 5) currentStepNum = totalSteps;
  const progressPercent = Math.round((currentStepNum / totalSteps) * 100);

  /** Any of the three save paths in flight. Read by both save buttons. */
  const isSaving =
    createApartmentMutation.isPending ||
    updateRatingsMutation.isPending ||
    updateApartmentMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col justify-between font-sans selection:bg-blue-500/20 selection:text-blue-400 overflow-y-auto">
      {/* Top Navigation & Progress */}
      <header className="px-4 sm:px-6 py-4 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-extrabold shadow-inner shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-zinc-100 tracking-tight leading-snug">
                {isEditing ? 'Edit Listing' : 'Apartment Evaluation Wizard'}
              </h1>
              <p className="text-xs text-zinc-400">
                Step {currentStepNum} of {totalSteps}: {step === 1 && 'Basic Listing Info'}
                {step === 2 && `Dealbreaker Check (${dealbreakerIndex + 1}/${dealbreakerFeatures.length})`}
                {step === 3 && 'High Priority Scoring'}
                {step === 4 && 'Room Quality Breakdown'}
                {step === 5 && 'Listing Saved & Pipeline Active!'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditing && step !== 5 && (
              <button
                type="button"
                onClick={handleSubmitFinal}
                disabled={isSaving}
                title="Save changes and re-score"
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isSaving ? 'Saving' : 'Save'}</span>
              </button>
            )}

            <button
              onClick={handleCloseModal}
              title="Cancel & Exit"
              className="w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-10 flex flex-col justify-start">
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4 rounded-2xl flex items-center gap-3 mb-6 animate-in fade-in">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* SCREEN 1: BASIC INFO */}
        {step === 1 && (
          <form onSubmit={handleNextFromStep1} className="space-y-6 animate-in fade-in duration-300">
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
                Step 1: Listing Details
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Paste the description straight from the portal and fill in what you know.
                Anything you leave blank is recorded as not stated rather than guessed at.
              </p>
            </div>

            <div className="space-y-5 bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-5 sm:p-7">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-400" />
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" required
                    placeholder="e.g. Estudio en Palacio, Madrid"
                    value={titleInput} onChange={(e) => setTitleInput(e.target.value)}
                    className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    Monthly rent ({profile?.currency || 'EUR'}) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number" step="any" min={0} required inputMode="decimal"
                    placeholder="1350"
                    value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Listing description
                </label>
                <textarea
                  rows={7}
                  placeholder="Paste the listing text here..."
                  value={descriptionInput} onChange={(e) => setDescriptionInput(e.target.value)}
                  className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[150px] leading-relaxed resize-y"
                />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Used for the AI review, the compromise summary and your outreach draft.
                  It is treated as untrusted text and never rendered as HTML.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Size (m²)</label>
                  <input type="number" min={0} inputMode="numeric" placeholder="34"
                    value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Rooms</label>
                  <input type="number" min={0} inputMode="numeric" placeholder="1"
                    value={roomsInput} onChange={(e) => setRoomsInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Bathrooms</label>
                  <input type="number" min={0} inputMode="numeric" placeholder="1"
                    value={bathroomsInput} onChange={(e) => setBathroomsInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Floor</label>
                  <input type="text" placeholder="Bajo, 2º"
                    value={floorInput} onChange={(e) => setFloorInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Neighbourhood</label>
                  <input type="text" placeholder="Palacio"
                    value={neighborhoodInput} onChange={(e) => setNeighborhoodInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">City</label>
                  <input type="text" placeholder="Madrid"
                    value={cityInput} onChange={(e) => setCityInput(e.target.value)} className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-zinc-500" />
                  Link (optional)
                </label>
                <input
                  type="url"
                  placeholder="https://www.idealista.com/inmueble/12345678/"
                  value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-[16px] sm:text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[52px]"
                />
                <p className="text-xs text-zinc-500">Kept so you can reopen the listing. Never fetched.</p>
              </div>
            </div>

            <div className="w-full flex justify-end pt-2">
              <button
                type="submit"
                className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        )}

        {/* SCREEN 2: DEALBREAKERS (CARD PER CARD) */}
        {step === 2 && dealbreakerFeatures.length > 0 && (() => {
          const feat = dealbreakerFeatures[dealbreakerIndex];
          const currentRating = featureRatings[feat.id] ?? 3;

          return (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Non-Negotiable Dealbreaker ({dealbreakerIndex + 1} of {dealbreakerFeatures.length})
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
                  Rate: {feat.name}
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feat.description}
                </p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-zinc-300">
                    How well does this listing meet your criteria for <strong className="text-white">{feat.name}</strong>?
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 sm:gap-3 pt-2">
                  {[1, 2, 3, 4, 5].map((val) => {
                    const isSelected = currentRating === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRating(feat.id, val)}
                        className={`py-4 sm:py-5 rounded-2xl font-extrabold text-base sm:text-lg transition-all cursor-pointer flex flex-col items-center justify-center gap-1 border min-h-[64px] ${getGradeBtnClass(val, isSelected)}`}
                      >
                        <span>{val}</span>
                      </button>
                    );
                  })}
                </div>

                {currentRating === 1 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-300 text-xs sm:text-sm animate-in fade-in">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <strong className="font-bold block">Soft Dealbreaker Flagged!</strong>
                      If you score several deal breakers as 1, this property will not be greenlit.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 pt-4">
                <button
                  type="button"
                  onClick={handlePrevFromDealbreakers}
                  className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextFromDealbreakers}
                  className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
                >
                  <span>Next</span>
                  <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* SCREEN 3: HIGH PRIORITIES (CONSOLIDATED SCREEN) */}
        {step === 3 && highPriorityFeatures.length > 0 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5" />
                High Priority Scoring (Weight 4)
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
                Rate All High Priority Features
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Rank each feature from 1 (Poor) to 5 (Perfect). Note: Features you weighted 3 or below during onboarding are automatically excluded from scoring.
              </p>
            </div>

            <div className="space-y-4 sm:space-y-5">
              {highPriorityFeatures.map((feat) => {
                const currentRating = featureRatings[feat.id] ?? 3;
                return (
                  <div
                    key={feat.id}
                    className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-700/80 transition-all"
                  >
                    <div className="space-y-1 max-w-sm">
                      <h3 className="text-base font-bold text-zinc-100">{feat.name}</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">{feat.description}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((val) => {
                        const isSelected = currentRating === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setRating(feat.id, val)}
                            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl font-extrabold text-sm sm:text-base transition-all cursor-pointer flex items-center justify-center border ${getGradeBtnClass(val, isSelected)}`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 pt-4">
              <button
                type="button"
                onClick={handlePrevFromHighPriorities}
                className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
              >
                <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleNextFromHighPriorities}
                className="flex-1 sm:flex-initial bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer text-base sm:text-sm active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 4: ROOM QUALITY SCORING (1-5 SCALE) */}
        {step === 4 && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Home className="w-3.5 h-3.5" />
                Physical Space Audit (1-5 Scale)
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
                Rate Each Room from 1 to 5
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Give an overall quality and condition score (1 to 5) for each physical space in the apartment.
              </p>
            </div>

            <div className="space-y-4 sm:space-y-5">
              {[
                { id: 'livingRoom', label: 'Living Room', icon: Home, desc: 'Spaciousness, comfort, and layout flow.' },
                { id: 'bedroom', label: 'Bedroom', icon: Bed, desc: 'Quietness, window size, and bed accommodation.' },
                { id: 'kitchen', label: 'Kitchen', icon: Utensils, desc: 'Appliance modernity and storage ergonomics.' },
                { id: 'bathroom', label: 'Bathroom', icon: Bath, desc: 'Water pressure, hygiene, and ventilation.' },
                { id: 'entryway', label: 'Entryway / Hall', icon: DoorOpen, desc: 'First impression, coat storage, and security.' },
              ].map((room) => {
                const currentScore = roomScores[room.id] ?? 3;
                const IconComponent = room.icon;

                return (
                  <div
                    key={room.id}
                    className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 space-y-4 hover:border-zinc-700/80 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-emerald-400 shrink-0">
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-zinc-100">{room.label}</h3>
                          <p className="text-xs text-zinc-400">{room.desc}</p>
                        </div>
                      </div>

                      <span className="text-lg font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl shrink-0">
                        {currentScore} / 5
                      </span>
                    </div>

                    {/* 1-5 Button Bar */}
                    <div className="grid grid-cols-5 gap-2 sm:gap-2.5 pt-2">
                      {[1, 2, 3, 4, 5].map((val) => {
                        const isSelected = currentScore === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setRoomScore(room.id, val)}
                            className={`py-3 sm:py-3.5 rounded-xl font-bold text-sm sm:text-base min-h-[44px] transition-all cursor-pointer flex items-center justify-center border ${
                              isSelected
                                ? 'bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-500/30 scale-105 font-black'
                                : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 pt-4">
              <button
                type="button"
                onClick={handlePrevFromRooms}
                className="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold px-6 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] border border-zinc-800"
              >
                <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleSubmitFinal}
                disabled={isSaving}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-extrabold px-8 py-4 sm:py-3.5 rounded-2xl min-h-[52px] sm:min-h-[48px] shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-base sm:text-sm active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: SAVE CONFIRMATION */}
        {step === 5 && (
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center items-center text-center py-12 px-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 shadow-2xl shadow-emerald-500/10">
              <CheckCircle2 className="w-10 h-10 stroke-[2]" />
            </div>

            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              Scoring Now
            </span>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight mb-3">
              Listing Saved Successfully!
            </h2>

            <p className="text-zinc-400 text-sm leading-relaxed mb-8 max-w-sm">
              Your ratings and room scores are saved. The listing is being scored against your criteria now — it will appear on the dashboard in a moment.
            </p>

            <button
              onClick={handleCloseModal}
              className="w-full sm:w-auto min-w-[240px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-extrabold px-8 py-4 rounded-2xl min-h-[52px] shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-base active:scale-[0.98]"
            >
              <span>Return to Command Center</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

