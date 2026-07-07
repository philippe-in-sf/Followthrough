import { ArrowLeft, ArrowRight, Check, HelpCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppSection } from "./shellNavigation";

type GuidedTourStep = {
  body: string;
  section?: AppSection;
  targetId: string;
  title: string;
};

type TargetBox = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const guidedTourStorageKeyPrefix = "followthrough.guidedTour.v1.completed";

const guidedTourSteps: GuidedTourStep[] = [
  {
    targetId: "primary-navigation",
    title: "Primary navigation",
    body: "Move between the operational areas from this rail. The current section stays highlighted.",
  },
  {
    targetId: "section-context",
    title: "Section context",
    body: "This rail gives each area a short summary and the most useful record counts or shortcuts.",
  },
  {
    targetId: "global-search",
    title: "Global search",
    body: "Search by public ID, title, description, attendee, or person when you already know what you need.",
  },
  {
    section: "Dashboard",
    targetId: "dashboard-overview",
    title: "Dashboard overview",
    body: "Start here for blockers, overdue work, due-soon tasks, recent meetings, and recurring-series activity.",
  },
  {
    section: "Tasks",
    targetId: "task-workflow",
    title: "Task workflow",
    body: "Filter the task list, scan lanes, expand details, and jump through clickable meeting or series chips.",
  },
  {
    section: "Meetings",
    targetId: "meeting-capture",
    title: "Meeting capture",
    body: "Quick-add a meeting, import calendar details, then capture notes, links, attendees, and follow-up work.",
  },
];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getGuidedTourStorageKey(userId: number) {
  return `${guidedTourStorageKeyPrefix}.${userId}`;
}

function readTourCompleted(storageKey: string) {
  return storage()?.getItem(storageKey) === "true";
}

function storeTourCompleted(storageKey: string) {
  storage()?.setItem(storageKey, "true");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function measureTarget(targetId: string): TargetBox | null {
  const target = document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`);
  if (!target) return null;

  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const rect = target.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function targetStyle(targetBox: TargetBox | null) {
  if (!targetBox) return undefined;

  const padding = 8;
  return {
    height: `${Math.max(36, targetBox.height + padding * 2)}px`,
    left: `${Math.max(8, targetBox.left - padding)}px`,
    top: `${Math.max(8, targetBox.top - padding)}px`,
    width: `${Math.max(36, targetBox.width + padding * 2)}px`,
  };
}

function cardStyle(targetBox: TargetBox | null) {
  const width = Math.min(380, Math.max(280, window.innerWidth - 32));
  if (!targetBox) {
    return {
      left: `${Math.max(16, (window.innerWidth - width) / 2)}px`,
      top: `${Math.max(16, window.innerHeight * 0.18)}px`,
      width: `${width}px`,
    };
  }

  const gap = 18;
  const hasRoomRight = targetBox.left + targetBox.width + width + gap < window.innerWidth;
  const hasRoomLeft = targetBox.left - width - gap > 0;
  const left = hasRoomRight
    ? targetBox.left + targetBox.width + gap
    : hasRoomLeft
      ? targetBox.left - width - gap
      : clamp(targetBox.left, 16, window.innerWidth - width - 16);
  const top = clamp(targetBox.top, 16, Math.max(16, window.innerHeight - 260));

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
}

export function GuidedTour({
  section,
  onSectionChange,
  userId,
}: {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  userId: number;
}) {
  const storageKey = useMemo(() => getGuidedTourStorageKey(userId), [userId]);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const currentStep = guidedTourSteps[stepIndex];
  const isFinalStep = stepIndex === guidedTourSteps.length - 1;

  useEffect(() => {
    if (!readTourCompleted(storageKey)) {
      setOpen(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    if (currentStep.section && section !== currentStep.section) {
      onSectionChange(currentStep.section);
    }
  }, [currentStep, onSectionChange, open, section]);

  useEffect(() => {
    if (!open) return undefined;

    function updateTargetBox() {
      setTargetBox(measureTarget(currentStep.targetId));
    }

    const timer = window.setTimeout(updateTargetBox, 80);
    window.addEventListener("resize", updateTargetBox);
    window.addEventListener("scroll", updateTargetBox, true);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateTargetBox);
      window.removeEventListener("scroll", updateTargetBox, true);
    };
  }, [currentStep, open, section]);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function startTour() {
    setStepIndex(0);
    setOpen(true);
  }

  function finishTour() {
    storeTourCompleted(storageKey);
    setOpen(false);
  }

  function nextStep() {
    if (isFinalStep) {
      finishTour();
      return;
    }

    setStepIndex((current) => current + 1);
  }

  return (
    <>
      <button
        aria-label="Start guided tour"
        className="icon-button guided-tour-launcher"
        onClick={startTour}
        title="Start guided tour"
        type="button"
      >
        <HelpCircle aria-hidden="true" size={18} />
      </button>
      {open ? (
        <div className="guided-tour-layer">
          {targetBox ? (
            <div className="guided-tour-highlight" style={targetStyle(targetBox)} />
          ) : (
            <div className="guided-tour-backdrop" />
          )}
          <section
            aria-label="Guided tour"
            aria-modal="true"
            className="guided-tour-card"
            role="dialog"
            style={cardStyle(targetBox)}
          >
            <div className="guided-tour-card-header">
              <span>
                Step {stepIndex + 1} of {guidedTourSteps.length}
              </span>
              <button
                aria-label="Close guided tour"
                className="icon-button guided-tour-close"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <h2>{currentStep.title}</h2>
            <p>{currentStep.body}</p>
            <div className="guided-tour-actions">
              <button className="secondary-button" onClick={finishTour} type="button">
                Skip tour
              </button>
              <div>
                <button
                  aria-label="Previous tour step"
                  className="secondary-button icon-text-button"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                  Back
                </button>
                <button
                  className="primary-button icon-text-button"
                  onClick={nextStep}
                  type="button"
                >
                  {isFinalStep ? (
                    <>
                      <Check aria-hidden="true" size={16} />
                      Finish
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight aria-hidden="true" size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
