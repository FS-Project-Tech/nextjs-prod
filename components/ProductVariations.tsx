"use client";

import { useState, useMemo, useEffect } from "react";
import type { WooCommerceVariation } from "@/lib/woocommerce";

interface VariationAttribute {
  name: string;
  options: string[];
}

interface ProductVariationsProps {
  attributes: VariationAttribute[];
  variations: WooCommerceVariation[];
  onVariationChange?: (
    variation: WooCommerceVariation | null,
    selectedAttributes: { [name: string]: string }
  ) => void;
  onSkuChange?: (sku: string | null) => void;
  defaultSelected?: { [name: string]: string };
  style?: "swatches" | "buttons" | "dropdowns";
}

/**
 * Normalizes attribute names for comparison (handles case-insensitive matching)
 */
function normalizeAttributeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Normalizes attribute option values for comparison
 */
function normalizeOptionValue(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Comparable key for Woo attribute names (`Length`, `pa_length`, `attribute_pa_length`, `Each | Box`)
 */
function attributeKey(name: string): string {
  let s = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/^attribute_/, "");
  if (s.startsWith("pa_")) s = s.slice(3);
  return s.replace(/[^a-z0-9]+/g, "");
}

/**
 * Checks if two attribute names match (labels vs slugs / pa_ prefixes)
 */
function attributeNameMatches(a: string, b: string): boolean {
  const ka = attributeKey(a);
  const kb = attributeKey(b);
  if (ka.length > 0 && kb.length > 0) return ka === kb;
  return normalizeAttributeName(a) === normalizeAttributeName(b);
}

/**
 * Checks if two option values match (case-insensitive)
 */
function optionValueMatches(a: string, b: string): boolean {
  return normalizeOptionValue(a) === normalizeOptionValue(b);
}

function isAnyVariationOption(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const v = normalizeOptionValue(raw);
  if (v === "any" || v === "*") return true;
  if (v.startsWith("any ") || v.startsWith("any-") || v.startsWith("any|") || v.startsWith("any/"))
    return true;
  return /^any\b/i.test(raw);
}

function variationOptionMatchesSelected(variationOption: string, selectedValue: string): boolean {
  if (isAnyVariationOption(variationOption)) return true;
  return optionValueMatches(variationOption, selectedValue);
}

function optionInAvailableList(option: string, available: string[]): boolean {
  return available.some((o) => optionValueMatches(o, option));
}

/**
 * Finds the matched variation based on selected attributes
 */
function findMatchedVariation(
  variations: WooCommerceVariation[],
  selectedAttributes: { [name: string]: string }
): WooCommerceVariation | null {
  const selectedKeys = Object.keys(selectedAttributes);
  if (selectedKeys.length === 0) return null;

  return (
    variations.find((variation) => {
      // 1) All selected attributes must match this variation (respecting "Any ...")
      const selectedMatch = selectedKeys.every((attrName) => {
        const selectedValue = selectedAttributes[attrName];
        const variationAttr = variation.attributes.find((attr) =>
          attributeNameMatches(attr.name, attrName)
        );
        return variationAttr && variationOptionMatchesSelected(variationAttr.option, selectedValue);
      });
      if (!selectedMatch) return false;

      // 2) All concrete variation attributes must be selected, otherwise this is still partial.
      //    Keys on `selectedAttributes` use product labels; variation rows may use `pa_*` names.
      return variation.attributes.every((attr) => {
        if (isAnyVariationOption(attr.option)) return true;
        const selectedKey = Object.keys(selectedAttributes).find((k) =>
          attributeNameMatches(k, attr.name)
        );
        const selectedValue = selectedKey ? selectedAttributes[selectedKey] : undefined;
        return !!selectedValue && optionValueMatches(attr.option, selectedValue);
      });
    }) || null
  );
}

/**
 * Gets all available options for a specific attribute from variations
 */
function getAvailableOptionsForAttribute(
  attributeName: string,
  variations: WooCommerceVariation[]
): Set<string> {
  const options = new Set<string>();
  variations.forEach((variation) => {
    const attr = variation.attributes.find((a) => attributeNameMatches(a.name, attributeName));
    if (attr && variation.stock_status !== "outofstock") {
      if (!isAnyVariationOption(attr.option)) options.add(attr.option);
    }
  });
  return options;
}

/**
 * Variations that match every *selected* attribute before `optionIndex` in `attributeOrder`.
 * Unselected earlier attributes are not enforced (Woo-style: union until user chooses).
 */
function variationsMatchingPriorSelections(
  variations: WooCommerceVariation[],
  attributeOrder: VariationAttribute[],
  selectedAttributes: { [name: string]: string },
  optionIndex: number
): WooCommerceVariation[] {
  return variations.filter((variation) => {
    if (variation.stock_status === "outofstock") return false;
    for (let j = 0; j < optionIndex; j++) {
      const def = attributeOrder[j];
      const sel = selectedAttributes[def.name];
      if (!sel || !String(sel).trim()) {
        if (j === 0) return false;
        continue;
      }
      const va = variation.attributes.find((a) => attributeNameMatches(a.name, def.name));
      if (!va || !variationOptionMatchesSelected(va.option, sel)) return false;
    }
    return true;
  });
}

function concreteOptionsForAttribute(
  matchingVariations: WooCommerceVariation[],
  attributeName: string
): string[] {
  const options = new Set<string>();
  matchingVariations.forEach((variation) => {
    const attr = variation.attributes.find((a) => attributeNameMatches(a.name, attributeName));
    if (attr && !isAnyVariationOption(attr.option)) options.add(attr.option);
  });
  return Array.from(options);
}

export default function ProductVariations({
  attributes,
  variations,
  onVariationChange,
  onSkuChange,
  defaultSelected = {},
  style = "swatches",
}: ProductVariationsProps) {
  const [selectedAttributes, setSelectedAttributes] = useState<{ [name: string]: string }>(
    defaultSelected
  );

  // Determine main and secondary attributes (first attribute is main, rest are secondary)
  const mainAttribute = attributes.length > 0 ? attributes[0] : null;
  const secondaryAttributes = attributes.slice(1);

  // Find matched variation based on current selections
  const matchedVariation = useMemo(() => {
    return findMatchedVariation(variations, selectedAttributes);
  }, [variations, selectedAttributes]);

  // Get available options for main attribute
  const mainAttributeOptions = useMemo(() => {
    if (!mainAttribute) return [];
    return Array.from(getAvailableOptionsForAttribute(mainAttribute.name, variations));
  }, [mainAttribute, variations]);

  // Eligible options per attribute index: each row only sees variations consistent with
  // the main selection + any selections already made for earlier secondary rows (Woo-style).
  const secondaryAttributeOptions = useMemo(() => {
    if (!mainAttribute || !selectedAttributes[mainAttribute.name]) {
      return secondaryAttributes.reduce(
        (acc, attr) => {
          acc[attr.name] = [];
          return acc;
        },
        {} as { [name: string]: string[] }
      );
    }

    return secondaryAttributes.reduce(
      (acc, attr) => {
        const idx = attributes.indexOf(attr);
        if (idx <= 0) return acc;
        const pool = variationsMatchingPriorSelections(
          variations,
          attributes,
          selectedAttributes,
          idx
        );
        acc[attr.name] = concreteOptionsForAttribute(pool, attr.name);
        return acc;
      },
      {} as { [name: string]: string[] }
    );
  }, [mainAttribute, secondaryAttributes, selectedAttributes, variations, attributes]);

  useEffect(() => {
    if (!mainAttribute || !selectedAttributes[mainAttribute.name]) return;

    const normalizedSelected: { [name: string]: string } = { ...selectedAttributes };
    let changed = false;

    secondaryAttributes.forEach((attr) => {
      const availableOptions = secondaryAttributeOptions[attr.name] || [];
      const selectedValue = normalizedSelected[attr.name];

      // Drop invalid existing selection when dependencies change.
      if (selectedValue && !optionInAvailableList(selectedValue, availableOptions)) {
        delete normalizedSelected[attr.name];
        changed = true;
      }

      // Woo-like behavior: if only one concrete value is possible, select it automatically.
      if (!normalizedSelected[attr.name] && availableOptions.length === 1) {
        normalizedSelected[attr.name] = availableOptions[0];
        changed = true;
      }
    });

    if (changed) setSelectedAttributes(normalizedSelected);
  }, [mainAttribute, secondaryAttributes, secondaryAttributeOptions, selectedAttributes]);

  /** Show secondary rows once colour (main) is chosen — every option is listed; invalid combos stay disabled. */
  const shouldShowSecondarySection = useMemo(() => {
    if (!mainAttribute || !selectedAttributes[mainAttribute.name]) {
      return false;
    }
    return secondaryAttributes.length > 0;
  }, [mainAttribute, selectedAttributes, secondaryAttributes]);

  const isOptionEnabled = (attributeName: string, option: string): boolean => {
    if (mainAttribute && attributeNameMatches(attributeName, mainAttribute.name)) {
      return optionInAvailableList(option, mainAttributeOptions);
    }

    if (mainAttribute && selectedAttributes[mainAttribute.name]) {
      const availableOptions = secondaryAttributeOptions[attributeName] || [];
      return optionInAvailableList(option, availableOptions);
    }

    return false;
  };

  // Handle attribute selection
  const handleAttributeSelect = (attributeName: string, option: string) => {
    // Prevent selection of disabled options
    if (!isOptionEnabled(attributeName, option)) {
      return;
    }

    const newSelected = {
      ...selectedAttributes,
      [attributeName]: option,
    };

    const changedIdx = attributes.findIndex((a) => attributeNameMatches(a.name, attributeName));
    if (changedIdx >= 0) {
      for (let k = changedIdx + 1; k < attributes.length; k++) {
        delete newSelected[attributes[k].name];
      }
    }

    setSelectedAttributes(newSelected);
  };

  // Notify parent components when variation or SKU changes
  useEffect(() => {
    if (onVariationChange) {
      onVariationChange(matchedVariation, selectedAttributes);
    }
  }, [matchedVariation, selectedAttributes, onVariationChange]);

  useEffect(() => {
    if (onSkuChange) {
      // Clear SKU if no valid variation is matched
      // SKU will be set when a complete valid combination is selected
      onSkuChange(matchedVariation?.sku || null);
    }
  }, [matchedVariation?.sku, matchedVariation, onSkuChange]);

  // Render swatch button
  const renderSwatch = (
    attributeName: string,
    option: string,
    isSelected: boolean,
    isEnabled: boolean
  ) => {
    return (
      <button
        key={option}
        type="button"
        onClick={() => handleAttributeSelect(attributeName, option)}
        disabled={!isEnabled}
        className={`rounded-md border px-4 py-2 text-sm font-medium transition-all ${
          isSelected
            ? "border-black bg-black text-white"
            : isEnabled
              ? "border-black bg-transparent text-black hover:bg-gray-50"
              : "border-black bg-transparent text-black disabled-option"
        }`}
      >
        {option}
      </button>
    );
  };

  // Render button style
  const renderButton = (
    attributeName: string,
    option: string,
    isSelected: boolean,
    isEnabled: boolean
  ) => {
    return (
      <button
        key={option}
        type="button"
        onClick={() => handleAttributeSelect(attributeName, option)}
        disabled={!isEnabled}
        className={`rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all ${
          isSelected
            ? "border-gray-900 bg-gray-900 text-white"
            : isEnabled
              ? "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
              : "border-gray-200 bg-gray-50 text-gray-600 disabled-option cursor-not-allowed"
        }`}
      >
        {option}
      </button>
    );
  };

  const renderDropdown = (
    attributeName: string,
    allOptions: string[],
    availableOptions: string[],
    selectedValue: string | undefined
  ) => {
    return (
      <select
        key={attributeName}
        value={selectedValue || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v && !optionInAvailableList(v, availableOptions)) return;
          handleAttributeSelect(attributeName, v);
        }}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        <option value="">Select {attributeName}</option>
        {allOptions.map((option) => {
          const canPick = optionInAvailableList(option, availableOptions);
          return (
            <option key={option} value={option} disabled={!canPick}>
              {!canPick ? `${option} (unavailable)` : option}
            </option>
          );
        })}
      </select>
    );
  };

  if (attributes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4" suppressHydrationWarning>
      {/* Main Attribute */}
      {mainAttribute && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {mainAttribute.name}
          </label>
          <div className="flex flex-wrap gap-2">
            {mainAttribute.options.length > 0 ? (
              mainAttribute.options
                .filter((option) => optionInAvailableList(option, mainAttributeOptions))
                .map((option) => {
                const isSelected = selectedAttributes[mainAttribute.name] === option;
                const isEnabled = isOptionEnabled(mainAttribute.name, option);

                if (style === "swatches") {
                  return renderSwatch(mainAttribute.name, option, isSelected, isEnabled);
                } else if (style === "buttons") {
                  return renderButton(mainAttribute.name, option, isSelected, isEnabled);
                }
                return null;
                })
            ) : (
              <p className="text-sm text-gray-500">No options available</p>
            )}
          </div>
          {style === "dropdowns" && (
            <div className="mt-2">
              {renderDropdown(
                mainAttribute.name,
                mainAttributeOptions,
                mainAttributeOptions,
                selectedAttributes[mainAttribute.name]
              )}
            </div>
          )}
        </div>
      )}

      {/* Secondary Attributes - Only show if valid combinations exist */}
      {shouldShowSecondarySection && (
        <div className="block">
          {secondaryAttributes.map((attribute) => {
            const attrIdx = attributes.indexOf(attribute);
            if (attrIdx > 0) {
              for (let k = 1; k < attrIdx; k++) {
                const prior = attributes[k];
                const priorOpts = secondaryAttributeOptions[prior.name] || [];
                if (priorOpts.length === 0) continue;
                if (!selectedAttributes[prior.name]) return null;
              }
            }

            const availableOptions = secondaryAttributeOptions[attribute.name] || [];
            const selectedValue = selectedAttributes[attribute.name];

            // Hide non-applicable attribute rows (e.g., all matching variations have "Any ..." here).
            if (!attribute.options?.length || availableOptions.length === 0) {
              return null;
            }

            return (
              <div key={attribute.name} className="mb-4 block last:mb-0">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {attribute.name}
                </label>
                {style === "dropdowns" ? (
                  <div>
                    {renderDropdown(
                      attribute.name,
                      availableOptions,
                      availableOptions,
                      selectedValue
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {attribute.options
                      .filter((option) => optionInAvailableList(option, availableOptions))
                      .map((option) => {
                      const isSelected = selectedValue === option;
                      const isEnabled = isOptionEnabled(attribute.name, option);

                      if (style === "swatches") {
                        return renderSwatch(attribute.name, option, isSelected, isEnabled);
                      }
                      return renderButton(attribute.name, option, isSelected, isEnabled);
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
