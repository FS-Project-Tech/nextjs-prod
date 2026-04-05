"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type GalleryImage = {
  id: number;
  src: string;
  alt?: string;
  name?: string;
};

/** Woo variation image from REST API */
export type VariationImage = {
  id?: number;
  src: string;
  name?: string;
  alt?: string;
} | null;

type Ctx = {
  mergedImages: GalleryImage[];
  setVariationImage: (img: VariationImage) => void;
};

const ProductVariationGalleryContext = createContext<Ctx | null>(null);

function normalizeSrc(src: string) {
  return src.split("?")[0].trim().toLowerCase();
}

export function mergeVariationIntoGallery(
  base: GalleryImage[],
  variationImage: VariationImage
): GalleryImage[] {
  if (!variationImage?.src?.trim()) {
    return base;
  }
  const v: GalleryImage = {
    id: typeof variationImage.id === "number" ? variationImage.id : 0,
    src: variationImage.src.trim(),
    alt: variationImage.alt,
    name: variationImage.name,
  };
  const vNorm = normalizeSrc(v.src);
  const rest = base.filter((b) => normalizeSrc(b.src) !== vNorm);
  return [v, ...rest];
}

export function ProductVariationGalleryProvider({
  baseImages,
  children,
}: {
  baseImages: GalleryImage[];
  children: ReactNode;
}) {
  const [variationImage, setVariationImageState] = useState<VariationImage>(null);

  const setVariationImage = useCallback((img: VariationImage) => {
    setVariationImageState(img);
  }, []);

  const mergedImages = useMemo(
    () => mergeVariationIntoGallery(baseImages, variationImage),
    [baseImages, variationImage]
  );

  const value = useMemo(
    () => ({ mergedImages, setVariationImage }),
    [mergedImages, setVariationImage]
  );

  return (
    <ProductVariationGalleryContext.Provider value={value}>
      {children}
    </ProductVariationGalleryContext.Provider>
  );
}

export function useProductVariationGallery(): Ctx | null {
  return useContext(ProductVariationGalleryContext);
}
