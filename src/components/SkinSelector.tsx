import { Palette } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { appSkins, type AppSkinId } from "../appSkins";

export function SkinSelector({
  skin,
  onSkinChange,
}: {
  skin: AppSkinId;
  onSkinChange: (skin: AppSkinId) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const selectorRef = useRef<HTMLDivElement>(null);
  const selectedSkin = appSkins.find((option) => option.id === skin) ?? appSkins[0];

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseSkin(nextSkin: AppSkinId) {
    onSkinChange(nextSkin);
    setOpen(false);
  }

  return (
    <div className="skin-selector" ref={selectorRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={`Choose app skin, ${selectedSkin.name} selected`}
        className="icon-button skin-selector-toggle"
        onClick={() => setOpen((current) => !current)}
        title="Choose app skin"
        type="button"
      >
        <Palette aria-hidden="true" size={16} strokeWidth={2.1} />
      </button>
      {open ? (
        <div className="skin-options" id={popoverId} role="radiogroup" aria-label="App skin">
          {appSkins.map((option) => (
            <label
              className={option.id === skin ? "skin-option selected" : "skin-option"}
              key={option.id}
            >
              <input
                className="sr-only"
                checked={option.id === skin}
                name="app-skin"
                onChange={() => chooseSkin(option.id)}
                type="radio"
                value={option.id}
              />
              <span className="skin-swatch-row" aria-hidden="true">
                {option.swatches.map((color) => (
                  <span className="skin-swatch" key={color} style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="skin-option-label">{option.name}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
