export function buildVariationMap(variations: any[]) {
  const map: Record<string, any> = {};

  variations.forEach((v) => {
    const key = JSON.stringify(
      v.attributes.reduce((acc: any, attr: any) => {
        acc[attr.name] = attr.option;
        return acc;
      }, {})
    );

    map[key] = {
      id: v.id,
      price: Number(v.price || 0),
      regular_price: Number(v.regular_price || 0),
      sku: v.sku,
    };
  });

  return map;
}

export function transformProduct(product: any, variations: any[]) {
  const attributes =
    product.attributes
      ?.filter((a: any) => a.variation)
      .map((a: any) => ({
        name: a.name,
        options: a.options,
      })) || [];

  const variationMap = buildVariationMap(variations);

  return {
    id: product.id,
    name: product.name,
    price: Number(product.price || 0),
    regular_price: Number(product.regular_price || 0),
    sku: product.sku,
    images: product.images || [],
    attributes,
    variationMap,
  };
}
