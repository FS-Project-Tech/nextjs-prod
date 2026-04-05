"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { FileText, CloudUpload, User, MailCheck, Send } from "lucide-react";

/* Brand colors – also in globals.css as --ndis-primary, --ndis-secondary (hex here for alpha variants) */
const NDIS_PRIMARY = "#5B1D65";
const NDIS_SECONDARY = "#1F605F";
const NDIS_EMAIL = "ndis@joyamedicalsupplies.com.au";

const STEPS = [
  { id: 1, label: "Getting Started" },
  { id: 2, label: "Upload Your Form" },
  { id: 3, label: "Joya's Response" },
  { id: 4, label: "Check Your Email" },
  { id: 5, label: "Skip Paperwork" },
];

export default function NDISWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goNext = () => setCurrentStep((s) => Math.min(5, s + 1));
  const goPrev = () => setCurrentStep((s) => Math.max(1, s - 1));

  const handleStep2Submit = (e: React.FormEvent) => {
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
    setSubmitted(true);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Tabs – same width as card; active = purple, inactive = light gray + purple number */}
      <div className="flex w-full gap-2 mb-6">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setCurrentStep(step.id)}
              className={`flex flex-1 min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 sm:px-3 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                isActive
                  ? "text-white"
                  : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200/80"
              }`}
              style={isActive ? { backgroundColor: NDIS_PRIMARY } : undefined}
            >
              <span
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-200"
                }`}
                style={!isActive ? { color: NDIS_PRIMARY } : undefined}
              >
                {step.id}
              </span>
              <span className="whitespace-nowrap truncate">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content card – same width as tab row above */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 md:p-6 w-full">
        {/* Step 1: Getting Started */}
        {currentStep === 1 && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: NDIS_PRIMARY }}
              >
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">STEP 1</p>
                <h3 className="text-xl font-bold text-gray-900">Getting Started</h3>
              </div>
            </div>
            <p className="text-gray-700 mb-4">Fill out the registration form to begin.</p>
            <p className="text-gray-700 mb-6">
              This Board will enable the participants / organisation or their nominees to place
              medical orders easily. While filling out the form, member/participants will use email.
              After you complete the process, we could send you the login credentials on the given
              email.
            </p>
            <p className="font-semibold text-gray-900 mb-2">
              For Agency Manage / Plan Manage Participant
            </p>
            <a
              href="https://joyamedicalsupplies.com.au/wp-content/uploads/2024/11/NDIS-Service-Agreement-Editable.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline mb-6 block"
              style={{ color: NDIS_PRIMARY }}
            >
              Service Agreement NDIS Participants - Click here
            </a>
            <p className="font-semibold text-gray-900 mb-2">For Self Managed</p>
            <ul className="list-disc list-inside text-gray-700 space-y-1 mb-6">
              <li>Continue Purchasing As A Guest User</li>
              <li>Use an account option for get an invoice</li>
            </ul>
          </>
        )}

        {/* Step 2: Upload Your Form */}
        {currentStep === 2 && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: NDIS_PRIMARY }}
              >
                <CloudUpload className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">STEP 2</p>
                <h3 className="text-xl font-bold text-gray-900">Upload Your Form</h3>
              </div>
            </div>
            <p className="text-gray-600 mb-2">Submit your service agreement via email.</p>
            <p className="text-gray-600 mb-6">
              Send your completed form to{" "}
              <Link
                href={`mailto:${NDIS_EMAIL}`}
                className="font-medium underline"
                style={{ color: NDIS_PRIMARY }}
              >
                {NDIS_EMAIL}
              </Link>
            </p>
            {submitted ? (
              <div
                className="rounded-lg border p-4 mb-6"
                style={{ backgroundColor: `${NDIS_PRIMARY}10`, borderColor: `${NDIS_PRIMARY}40` }}
              >
                <p className="font-medium" style={{ color: NDIS_PRIMARY }}>
                  Thank you for your submission.
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  We will respond to {email || "your email"}. You can also email us at{" "}
                  <Link
                    href={`mailto:${NDIS_EMAIL}`}
                    className="underline"
                    style={{ color: NDIS_PRIMARY }}
                  >
                    {NDIS_EMAIL}
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <form onSubmit={handleStep2Submit} className="space-y-4 mb-6">
                <div>
                  <label
                    htmlFor="ndis-name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Name *
                  </label>
                  <input
                    id="ndis-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your Name"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ndis-email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email *
                  </label>
                  <input
                    id="ndis-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your Email Address"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap mb-1">
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
                      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: NDIS_PRIMARY }}
                    >
                      Choose a file
                    </button>
                    <span className="text-sm text-gray-500">
                      {file ? file.name : "No file chosen"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">Upload Here Your BA/SA Updated File</p>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-lg px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: NDIS_SECONDARY }}
                  >
                    Submit
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Step 3: Joya's Response */}
        {currentStep === 3 && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: NDIS_PRIMARY }}
              >
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">STEP 3</p>
                <h3 className="text-xl font-bold text-gray-900">Joya&apos;s Response</h3>
              </div>
            </div>
            <p className="text-gray-700 mb-4">
              You&apos;ll be assigned a dedicated account manager.
            </p>
            <hr className="border-gray-200 my-4" />
            <p className="text-gray-700 mb-2">
              Once you have completed the form you will be allocated to your dedicated account
              manager.
            </p>
            <p className="text-gray-700">
              Once the form is submitted, please allow us at least 24hrs to set up your account.
            </p>
          </>
        )}

        {/* Step 4: Check Your Email */}
        {currentStep === 4 && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: NDIS_PRIMARY }}
              >
                <MailCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">STEP 4</p>
                <h3 className="text-xl font-bold text-gray-900">Check Your Email</h3>
              </div>
            </div>
            <p className="text-gray-700 mb-4">Receive login credentials to start ordering.</p>
            <hr className="border-gray-200 my-4" />
            <p className="text-gray-700">Check your email for login credentials start ordering.</p>
          </>
        )}

        {/* Step 5: Skip Paperwork */}
        {currentStep === 5 && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: NDIS_PRIMARY }}
              >
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">STEP 5</p>
                <h3 className="text-xl font-bold text-gray-900">Skip Paperwork</h3>
              </div>
            </div>
            <p className="text-gray-700 mb-4">
              Use guest checkout – we&apos;ll invoice your plan manager.
            </p>
            <hr className="border-gray-200 my-4" />
            <p className="text-gray-700 mb-4">
              Simply use our Guest user option for an account – we will send your invoice directly
              to your plan manager!
            </p>
            <p className="font-bold text-gray-900">
              PS NOTE: All the order will be directed to our customer service for standard process
            </p>
          </>
        )}

        {/* Previous / Next – bottom of card */}
        <div className="flex justify-between items-center pt-6 mt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentStep === 1}
            className="font-medium disabled:text-gray-600 disabled:cursor-not-allowed hover:underline"
            style={{
              color: currentStep === 1 ? undefined : NDIS_PRIMARY,
            }}
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={currentStep === 5}
            className="font-medium disabled:text-gray-600 disabled:cursor-not-allowed hover:underline"
            style={{
              color: currentStep === 5 ? undefined : NDIS_PRIMARY,
            }}
          >
            Next &gt;
          </button>
        </div>
      </div>
    </div>
  );
}
