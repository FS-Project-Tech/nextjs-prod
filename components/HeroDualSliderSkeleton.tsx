/** Shown while `HeroDualSliderServer` loads ACF + media (streams shell faster). */
export default function HeroDualSliderSkeleton() {
  return (
    <div className="hero-banner-root min-w-0" aria-hidden>
      <div className="md:hidden w-full space-y-4">
        <div className="min-h-[200px] w-full animate-pulse rounded-lg bg-gray-200" />
        <div className="min-h-[160px] w-full animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="hidden w-full md:block">
        <div className="min-h-[280px] w-full animate-pulse rounded-lg bg-gray-200 lg:min-h-[320px]" />
      </div>
    </div>
  );
}
