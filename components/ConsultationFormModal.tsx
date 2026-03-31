"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";

interface ConsultationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
}

export default function ConsultationFormModal({
  isOpen,
  onClose,
  productName,
}: ConsultationFormModalProps) {
  const { user, loading: authLoading } = useAuth();
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    productName: productName,
    comment: "",
  });

  // Auto-fill form when user data is available
  useEffect(() => {
    if (user && !authLoading) {
      setFormData((prev) => ({
        ...prev,
        email: user.email || "",
        name: user.name || user.username || "",
      }));
    }
  }, [user, authLoading]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        email: user?.email || "",
        name: user?.name || user?.username || "",
        productName: productName,
        comment: "",
      });
    }
  }, [isOpen, user, productName]);

  // Check if user is logged in
  useEffect(() => {
    if (isOpen && !authLoading && !user) {
      showError("Please log in to request a consultation");
      onClose();
      // Redirect to login
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }, [isOpen, authLoading, user, onClose, showError]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      showError("Please log in to request a consultation");
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    if (!formData.email || !formData.comment.trim()) {
      showError("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/consultation/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit consultation request");
      }

      success("Consultation request submitted successfully! We'll contact you soon.");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit consultation request. Please try again.";
      console.error("Consultation request error:", err);
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Need Consultation</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1f605f]"
              disabled={!!user?.email}
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1f605f]"
            />
          </div>

          <div>
            <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1">
              Product Name
            </label>
            <input
              type="text"
              id="productName"
              value={formData.productName}
              readOnly
              className="w-full rounded-md border border-gray-300 px-3 py-2 bg-gray-50 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              id="comment"
              required
              rows={4}
              value={formData.comment}
              onChange={(e) =>
                setFormData({ ...formData, comment: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1f605f]"
              placeholder="Please provide details about your consultation needs..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-[#1f605f] px-4 py-2 text-white hover:bg-[#1a4d4c] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

