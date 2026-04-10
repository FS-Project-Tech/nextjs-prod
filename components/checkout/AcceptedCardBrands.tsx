import { memo } from "react";

/**
 * Compact card-brand marks beside the eWAY option (stylized, not official artwork).
 */
function AcceptedCardBrandsInner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      role="img"
      aria-label="Accepted cards: Visa, Mastercard, Discover, American Express, Maestro"
    >
      <svg
        className="h-6 w-[42px] shrink-0"
        viewBox="0 0 42 28"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="42" height="28" rx="3" fill="#1434CB" />
        <text
          x="21"
          y="19"
          textAnchor="middle"
          fill="#fff"
          fontSize="11"
          fontWeight="800"
          fontFamily='ui-sans-serif, system-ui, "Arial Black", Arial, sans-serif'
          letterSpacing="0.06em"
        >
          VISA
        </text>
      </svg>

      <svg
        className="h-6 w-10 shrink-0"
        viewBox="0 0 40 24"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="15" cy="12" r="9.5" fill="#EB001B" />
        <circle cx="25" cy="12" r="9.5" fill="#F79E1B" fillOpacity={0.95} />
      </svg>

      <svg
        className="h-6 w-[50px] shrink-0"
        viewBox="0 0 50 28"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="50" height="28" rx="3" fill="#212121" />
        <text
          x="6"
          y="17.5"
          fill="#fff"
          fontSize="7"
          fontWeight="700"
          fontFamily='ui-sans-serif, system-ui, Arial, sans-serif'
          letterSpacing="0.03em"
        >
          DISCOVER
        </text>
        <circle cx="41" cy="14" r="6.5" fill="#FF6000" />
      </svg>

      <svg
        className="h-6 w-[52px] shrink-0"
        viewBox="0 0 52 28"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="52" height="28" rx="3" fill="#006FCF" />
        <text
          x="26"
          y="12.5"
          textAnchor="middle"
          fill="#fff"
          fontSize="5.5"
          fontWeight="700"
          fontFamily='ui-sans-serif, system-ui, Arial, sans-serif'
          letterSpacing="0.02em"
        >
          AMERICAN
        </text>
        <text
          x="26"
          y="19.5"
          textAnchor="middle"
          fill="#fff"
          fontSize="5.5"
          fontWeight="700"
          fontFamily='ui-sans-serif, system-ui, Arial, sans-serif'
          letterSpacing="0.02em"
        >
          EXPRESS
        </text>
      </svg>

      <svg
        className="h-6 w-10 shrink-0"
        viewBox="0 0 40 24"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="40" height="24" rx="3" fill="#000" />
        <circle cx="15" cy="12" r="8" fill="#009CDE" />
        <circle cx="25" cy="12" r="8" fill="#ED1C24" fillOpacity={0.92} />
      </svg>
    </div>
  );
}

export default memo(AcceptedCardBrandsInner);
