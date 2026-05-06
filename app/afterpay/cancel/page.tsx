import Link from "next/link";

export default function AfterpayCancelPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Afterpay cancelled</h1>
      <p className="mt-3 text-sm text-gray-700">
        You cancelled or did not complete Afterpay. Your cart is unchanged — choose another payment method to continue.
      </p>
      <Link
        href="/checkout"
        className="mt-8 inline-flex rounded-md bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-black"
      >
        Back to checkout
      </Link>
    </div>
  );
}
