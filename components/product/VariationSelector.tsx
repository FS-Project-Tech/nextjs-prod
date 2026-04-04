"use client";

export default function VariationSelector({ attributes, selected, onChange }: any) {
  return (
    <div className="space-y-4">
      {attributes.map((attr: any) => (
        <div key={attr.name}>
          <p className="text-sm font-semibold">{attr.name}</p>

          <div className="flex gap-2 mt-2 flex-wrap">
            {attr.options.map((opt: string) => (
              <button
                key={opt}
                onClick={() =>
                  onChange((prev: any) => ({
                    ...prev,
                    [attr.name]: opt,
                  }))
                }
                className={`border px-3 py-1 rounded ${
                  selected[attr.name] === opt ? "bg-teal-600 text-white" : ""
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
