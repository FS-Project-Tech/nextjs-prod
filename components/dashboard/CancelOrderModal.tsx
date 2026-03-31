"use client";

import { useState } from 'react';
import { useToast } from '@/components/ToastProvider';

interface CancelOrderModalProps {
  orderId: number;
  onClose: () => void;
  onSuccess: () => void;
}

const CANCELLATION_POLICY = `
By cancelling this order, you agree to the following terms and conditions:

1. Cancellation Policy: Orders can only be cancelled if they are in "processing" status. Once an order is shipped or completed, it cannot be cancelled.

2. Refund Processing: If your order has been paid, a refund will be processed within 5-7 business days to your original payment method.

3. Order Modifications: Once cancelled, this order cannot be restored. You will need to place a new order if you wish to purchase these items again.

4. Inventory: Cancelled items will be returned to inventory and may become available for other customers.

5. Contact Support: If you have any questions about your cancellation, please contact our customer support team.

By clicking "Confirm Cancel", you acknowledge that you have read and agree to these terms and conditions.
`;

export default function CancelOrderModal({ orderId, onClose, onSuccess }: CancelOrderModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { error: showError } = useToast();

  const handleCancel = async () => {
    if (!agreed) {
      showError('Please agree to the cancellation policy');
      return;
    }

    setIsCancelling(true);
    try {
      const response = await fetch(`/api/dashboard/orders/${orderId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        onSuccess();
      } else {
        const errorData = await response.json();
        showError(errorData.error || 'Failed to cancel order');
      }
    } catch (err: any) {
      showError('Failed to cancel order. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Cancel Order #{orderId}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isCancelling}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Cancellation Policy & Terms</h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
                {CANCELLATION_POLICY}
              </pre>
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={isCancelling}
                className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the cancellation policy and terms and conditions stated above.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isCancelling}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
            >
              Close
            </button>
            <button
              onClick={handleCancel}
              disabled={!agreed || isCancelling}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

