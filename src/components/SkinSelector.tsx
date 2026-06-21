import { Palette } from "lucide-react";
import { appSkins, type AppSkinId } from "../appSkins";

export function SkinSelector({
  skin,
  onSkinChange,
}: {
  skin: AppSkinId;
  onSkinChange: (skin: AppSkinId) => void;
}) {
  return (
    <fieldset className="skin-selector">
      <legend>
        <Palette aria-hidden="true" size={16} strokeWidth={2.1} />
        <span>Skin</span>
      </legend>
      <div className="skin-options">
        {appSkins.map((option) => (
          <label className={option.id === skin ? "skin-option selected" : "skin-option"} key={option.id}>
            <input
              className="sr-only"
              checked={option.id === skin}
              name="app-skin"
              onChange={() => onSkinChange(option.id)}
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
    </fieldset>
  );
}
