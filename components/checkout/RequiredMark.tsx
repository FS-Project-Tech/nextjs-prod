export default function RequiredMark() {
  return (
    <>
      <span className="text-rose-600" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
