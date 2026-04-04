"use client";

import { useState, useRef } from "react";
import { CloudUpload } from "lucide-react";
import Link from "next/link";

const NDIS_EMAIL = "ndis@joyamedicalsupplies.com.au";

export default function NDISRegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!agree) {
      setError("Please agree to the Terms & Conditions.");
      return;
    }

    // Optional: send to API; for now show success and mailto link
    setSubmitted(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
        <span>STEP 2</span>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-xl font-bold text-gray-900">Upload Your Form</h3>
        <CloudUpload className="w-5 h-5 text-violet-600" />
      </div>
      <p className="text-gray-600 mb-4">Submit your service agreement via email.</p>
      <p className="text-gray-600 mb-6">
        Send your completed form to{" "}
        <Link href={`mailto:${NDIS_EMAIL}`} className="text-violet-600 font-medium hover:underline">
          {NDIS_EMAIL}
        </Link>
      </p>

      {submitted ? (
        <div className="rounded-lg bg-violet-50 border border-violet-200 p-4 text-violet-800">
          <p className="font-medium">Thank you for your submission.</p>
          <p className="text-sm mt-1">
            We will respond to <span className="font-medium">{email || "your email"}</span>. You can
            also email us directly at{" "}
            <Link href={`mailto:${NDIS_EMAIL}`} className="text-violet-600 underline">
              {NDIS_EMAIL}
            </Link>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ndis-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              id="ndis-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your Name"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label htmlFor="ndis-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              id="ndis-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your Email Address"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload your NDIS Uploaded File
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Choose a file
              </button>
              <span className="text-sm text-gray-500">{file ? file.name : "No file chosen"}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Submit
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              I&apos;ve read and agree to the Terms &amp; Conditions
            </label>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              className="text-violet-600 font-medium hover:underline flex items-center gap-1"
            >
              Next &gt;
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
