"use client";

import { useState, useMemo, useEffect } from "react";
import type { WooCommerceVariation, WooCommerceVariationAttribute } from "@/lib/woocommerce";

interface VariationAttribute {
  name: string;
  options: string[];
}

interface ProductVariationsProps {
  attributes: VariationAttribute[];
  variations: WooCommerceVariation[];
  onVariationChange?: (variation: WooCommerceVariation | null, selectedAttributes: { [name: string]: string }) => void;
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
 * Checks if two attribute names match (case-insensitive)
 */
function attributeNameMatches(a: string, b: string): boolean {
  return normalizeAttributeName(a) === normalizeAttributeName(b);
}

/**
 * Checks if two option values match (case-insensitive)
 */
function optionValueMatches(a: string, b: string): boolean {
  return normalizeOptionValue(a) === normalizeOptionValue(b);
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
      // Check if variation has all selected attributes with matching values
      return selectedKeys.every((attrName) => {
        const selectedValue = selectedAttributes[attrName];
        const variationAttr = variation.attributes.find((attr) =>
          attributeNameMatches(attr.name, attrName)
        );
        return variationAttr && optionValueMatches(variationAttr.option, selectedValue);
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
      options.add(attr.option);
    }
  });
  return options;
}

/**
 * Gets available options for secondary attributes based on main attribute selection
 */
function getAvailableSecondaryOptions(
  attributeName: string,
  mainAttributeName: string,
  mainAttributeValue: string,
  variations: WooCommerceVariation[]
): Set<string> {
  const options = new Set<string>();

  // Filter variations that match the main attribute selection
  const matchingVariations = variations.filter((variation) => {
    const mainAttr = variation.attributes.find((a) =>
      attributeNameMatches(a.name, mainAttributeName)
    );
    return (
      mainAttr &&
      optionValueMatches(mainAttr.option, mainAttributeValue) &&
      variation.stock_status !== "outofstock"
    );
  });

  // Extract options for the secondary attribute from matching variations
  matchingVariations.forEach((variation) => {
    const attr = variation.attributes.find((a) => attributeNameMatches(a.name, attributeName));
    if (attr) {
      options.add(attr.option);
    }
  });

  return options;
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

  // Get available options for each secondary attribute based on main selection
  const secondaryAttributeOptions = useMemo(() => {
    if (!mainAttribute || !selectedAttributes[mainAttribute.name]) {
      // If main attribute not selected, return empty for all secondary attributes
      return secondaryAttributes.reduce((acc, attr) => {
        acc[attr.name] = [];
        return acc;
      }, {} as { [name: string]: string[] });
    }

    const mainValue = selectedAttributes[mainAttribute.name];
    return secondaryAttributes.reduce((acc, attr) => {
      const options = getAvailableSecondaryOptions(
        attr.name,
        mainAttribute.name,
        mainValue,
        variations
      );
      acc[attr.name] = Array.from(options);
      return acc;
    }, {} as { [name: string]: string[] });
  }, [mainAttribute, secondaryAttributes, selectedAttributes, variations]);

  // Check if secondary section should be visible (has valid variations for selected main attribute)
  const shouldShowSecondarySection = useMemo(() => {
    if (!mainAttribute || !selectedAttributes[mainAttribute.name]) {
      return false;
    }

    // Check if at least one secondary attribute has available options
    return secondaryAttributes.some((attr) => {
      const options = secondaryAttributeOptions[attr.name] || [];
      return options.length > 0;
    });
  }, [mainAttribute, selectedAttributes, secondaryAttributes, secondaryAttributeOptions]);

  // Check if an option is enabled (available for selection)
  const isOptionEnabled = (attributeName: string, option: string): boolean => {
    // Main attribute options are always enabled (if they exist in variations)
    if (mainAttribute && attributeNameMatches(attributeName, mainAttribute.name)) {
      return mainAttributeOptions.includes(option);
    }

    // Secondary attribute options are enabled only if they exist in filtered list
    if (mainAttribute && selectedAttributes[mainAttribute.name]) {
      const availableOptions = secondaryAttributeOptions[attributeName] || [];
      return availableOptions.includes(option);
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

    // If main attribute is being changed, clear all secondary selections
    if (mainAttribute && attributeNameMatches(attributeName, mainAttribute.name)) {
      secondaryAttributes.forEach((attr) => {
        delete newSelected[attr.name];
      });
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
            : "border-gray-200 bg-gray-50 text-gray-400 disabled-option cursor-not-allowed"
        }`}
      >
        {option}
      </button>
    );
  };

  // Render dropdown
  const renderDropdown = (
    attributeName: string,
    options: string[],
    selectedValue: string | undefined,
    isEnabled: boolean
  ) => {
    return (
      <select
        key={attributeName}
        value={selectedValue || ""}
        onChange={(e) => handleAttributeSelect(attributeName, e.target.value)}
        disabled={!isEnabled}
        className={`w-full rounded-md border px-3 py-2 text-sm ${
          isEnabled
            ? "border-gray-300 bg-white text-gray-900"
            : "border-gray-200 bg-gray-50 text-gray-400 disabled-option cursor-not-allowed"
        }`}
      >
        <option value="">Select {attributeName}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
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
            {mainAttributeOptions.length > 0 ? (
              mainAttributeOptions.map((option) => {
                const isSelected = selectedAttributes[mainAttribute.name] === option;
                const isEnabled = isOptionEnabled(mainAttribute.name, option);

                if (style === "swatches") {
                  return renderSwatch(mainAttribute.name, option, isSelected, isEnabled);
                } else if (style === "buttons") {
                  return renderButton(mainAttribute.name, option, isSelected, isEnabled);
                } else {
                  // For dropdowns, we'll render all at once below
                  return null;
                }
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
                selectedAttributes[mainAttribute.name],
                true
              )}
            </div>
          )}
        </div>
      )}

      {/* Secondary Attributes - Only show if valid combinations exist */}
      {shouldShowSecondarySection && (
        <div className="block">
          {secondaryAttributes.map((attribute) => {
            // Get filtered options based on main selection
            const availableOptions = secondaryAttributeOptions[attribute.name] || [];
            const selectedValue = selectedAttributes[attribute.name];

            // Only render if this attribute has available options
            if (availableOptions.length === 0) {
              return null;
            }

            return (
              <div key={attribute.name} className="block">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {attribute.name}
                </label>
                {style === "dropdowns" ? (
                  <div>
                    {renderDropdown(
                      attribute.name,
                      availableOptions,
                      selectedValue,
                      availableOptions.length > 0
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableOptions.length > 0 ? (
                      availableOptions.map((option) => {
                        const isSelected = selectedValue === option;
                        const isEnabled = isOptionEnabled(attribute.name, option);

                        if (style === "swatches") {
                          return renderSwatch(attribute.name, option, isSelected, isEnabled);
                        } else {
                          return renderButton(attribute.name, option, isSelected, isEnabled);
                        }
                      })
                    ) : null}
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

