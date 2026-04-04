// "use client";

// import { useState, useEffect } from 'react';
// import withAuth, { WithAuthProps } from '@/lib/withAuth';
// import { useForm } from 'react-hook-form';
// import { yupResolver } from '@hookform/resolvers/yup';
// import * as yup from 'yup';
// import axios from 'axios';
// import { useQuery } from '@tanstack/react-query';
// import { useToast } from '@/components/ToastProvider';

// const accountSchema = yup.object({
//   first_name: yup.string().required('First name is required'),
//   last_name: yup.string().required('Last name is required'),
//   display_name: yup.string().required('Display name is required'),
//   email: yup.string().email('Invalid email').required('Email is required'),
//   current_password: yup.string().optional(),
//   new_password: yup.string().optional(),
//   confirm_new_password: yup
//     .string()
//     .optional()
//     .when('new_password', {
//       is: (val: string) => val && val.length > 0,
//       then: (schema) =>
//         schema.oneOf([yup.ref('new_password')], 'Passwords must match'),
//     }),
// });

// type AccountFormData = yup.InferType<typeof accountSchema>;

// function MyAccountPage({ user: authUser }: WithAuthProps) {
//   const { success, error: showError } = useToast();
//   const [showCurrentPassword, setShowCurrentPassword] = useState(false);
//   const [showNewPassword, setShowNewPassword] = useState(false);
//   const [showConfirmPassword, setShowConfirmPassword] = useState(false);

//   const { data: profileData, isLoading: fetching } = useQuery({
//     queryKey: ['profile', authUser?.id],
//     queryFn: async () => {
//       const response = await axios.get('/api/dashboard/profile', {
//         withCredentials: true,
//       });
//       return response.data;
//     },
//     enabled: !!authUser,
//     staleTime: 5 * 60 * 1000,
//     refetchOnWindowFocus: false,
//   });

//   const {
//     register,
//     handleSubmit,
//     formState: { errors, isSubmitting },
//     reset,
//   } = useForm<AccountFormData>({
//     resolver: yupResolver(accountSchema) as any,
//     defaultValues: {
//       first_name: '',
//       last_name: '',
//       display_name: '',
//       email: authUser?.email || '',
//       current_password: '',
//       new_password: '',
//       confirm_new_password: '',
//     },
//   });

//   useEffect(() => {
//     if (!profileData) return;
//     const customer = profileData.customer;
//     const user = profileData.user as { name?: string; email?: string; first_name?: string; last_name?: string };
//     // Prefer API user first/last (WP meta), then WooCommerce customer, then split user.name
//     const firstName = (user?.first_name ?? customer?.first_name ?? '')?.trim() || '';
//     const lastName = (user?.last_name ?? customer?.last_name ?? '')?.trim() || '';
//     const fromUserName = user?.name?.trim() ? (user.name as string).split(/\s+/) : [];
//     const fallbackFirst = fromUserName[0] ?? '';
//     const fallbackLast = fromUserName.slice(1).join(' ') ?? '';
//     const displayName =
//       (user?.name ?? ((firstName || lastName ? `${firstName} ${lastName}`.trim() : '') || `${fallbackFirst} ${fallbackLast}`.trim())) ||
//       authUser?.name ||
//       '';
//     reset({
//       first_name: firstName || fallbackFirst,
//       last_name: lastName || fallbackLast,
//       display_name: displayName || authUser?.name || (fallbackFirst || fallbackLast ? `${fallbackFirst} ${fallbackLast}`.trim() : ''),
//       email: customer?.email || user?.email || authUser?.email || '',
//       current_password: '',
//       new_password: '',
//       confirm_new_password: '',
//     });
//   }, [profileData, authUser, reset]);

//   const onSubmit = async (data: AccountFormData) => {
//     try {
//       await axios.put(
//         '/api/dashboard/profile',
//         {
//           first_name: data.first_name,
//           last_name: data.last_name,
//           display_name: data.display_name,
//           email: data.email,
//         },
//         { withCredentials: true }
//       );
//       success('Account updated successfully');

//       if (data.new_password && data.current_password) {
//         try {
//           await axios.post(
//             '/api/dashboard/change-password',
//             {
//               current_password: data.current_password,
//               new_password: data.new_password,
//             },
//             { withCredentials: true }
//           );
//           success('Password updated successfully');
//           reset({
//             ...data,
//             current_password: '',
//             new_password: '',
//             confirm_new_password: '',
//           });
//         } catch (err: any) {
//           const msg = err.response?.data?.error || 'Failed to update password';
//           showError(msg);
//         }
//       }
//     } catch (err: any) {
//       const msg = err.response?.data?.error || 'Failed to update account';
//       showError(msg);
//     }
//   };

//   const birthDate = profileData?.customer?.meta?.birth_date ?? profileData?.user?.birth_date ?? null;
//   const birthDateDisplay = birthDate
//     ? new Date(birthDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
//     : '—';

//   if (fetching) {
//     return (
//       <div className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
//         <div className="text-center">
//           <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
//           <p className="mt-4 text-gray-600">Loading...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gray-50 py-10">
//       <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
//         <div className="bg-white shadow rounded-lg">
//           <div className="px-6 py-5 border-b border-gray-200">
//             <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
//           </div>

//           <div className="px-6 py-5">
//             <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
//               <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
//                 <div>
//                   <label className="block text-sm font-medium text-gray-700 mb-1">
//                     First name <span className="text-red-500">*</span>
//                   </label>
//                   <input
//                     type="text"
//                     {...register('first_name')}
//                     className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
//                   />
//                   {errors.first_name && (
//                     <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
//                   )}
//                 </div>
//                 <div>
//                   <label className="block text-sm font-medium text-gray-700 mb-1">
//                     Last name <span className="text-red-500">*</span>
//                   </label>
//                   <input
//                     type="text"
//                     {...register('last_name')}
//                     className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
//                   />
//                   {errors.last_name && (
//                     <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
//                   )}
//                 </div>
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                   Display name <span className="text-red-500">*</span>
//                 </label>
//                 <input
//                   type="text"
//                   {...register('display_name')}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
//                 />
//                 <p className="mt-1 text-sm text-gray-500">
//                   This will be how your name will be displayed in the account section and in reviews.
//                 </p>
//                 {errors.display_name && (
//                   <p className="mt-1 text-sm text-red-600">{errors.display_name.message}</p>
//                 )}
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">
//                   Email address <span className="text-red-500">*</span>
//                 </label>
//                 <input
//                   type="email"
//                   {...register('email')}
//                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
//                 />
//                 {errors.email && (
//                   <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
//                 )}
//               </div>

//               <div className="pt-4 border-t border-gray-200">
//                 <h3 className="text-sm font-semibold text-gray-900 mb-3">Password change</h3>
//                 <div className="space-y-4">
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                       Current password (leave blank to leave unchanged)
//                     </label>
//                     <div className="relative">
//                       <input
//                         type={showCurrentPassword ? 'text' : 'password'}
//                         {...register('current_password')}
//                         className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 pr-10"
//                       />
//                       <button
//                         type="button"
//                         onClick={() => setShowCurrentPassword((s) => !s)}
//                         className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
//                         aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
//                       >
//                         {showCurrentPassword ? (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
//                           </svg>
//                         ) : (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
//                           </svg>
//                         )}
//                       </button>
//                     </div>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                       New password (leave blank to leave unchanged)
//                     </label>
//                     <div className="relative">
//                       <input
//                         type={showNewPassword ? 'text' : 'password'}
//                         {...register('new_password')}
//                         className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 pr-10"
//                       />
//                       <button
//                         type="button"
//                         onClick={() => setShowNewPassword((s) => !s)}
//                         className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
//                         aria-label={showNewPassword ? 'Hide password' : 'Show password'}
//                       >
//                         {showNewPassword ? (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
//                           </svg>
//                         ) : (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
//                           </svg>
//                         )}
//                       </button>
//                     </div>
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">
//                       Confirm new password
//                     </label>
//                     <div className="relative">
//                       <input
//                         type={showConfirmPassword ? 'text' : 'password'}
//                         {...register('confirm_new_password')}
//                         className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 pr-10"
//                       />
//                       <button
//                         type="button"
//                         onClick={() => setShowConfirmPassword((s) => !s)}
//                         className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
//                         aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
//                       >
//                         {showConfirmPassword ? (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
//                           </svg>
//                         ) : (
//                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
//                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
//                           </svg>
//                         )}
//                       </button>
//                     </div>
//                     {errors.confirm_new_password && (
//                       <p className="mt-1 text-sm text-red-600">{errors.confirm_new_password.message}</p>
//                     )}
//                   </div>
//                 </div>
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-1">Birth Date</label>
//                 <input
//                   type="text"
//                   readOnly
//                   value={birthDateDisplay}
//                   className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
//                 />
//                 <p className="mt-1 text-sm text-gray-500">
//                   Your birth date is set and cannot be changed.
//                 </p>
//               </div>

//               <div className="pt-4">
//                 <button
//                   type="submit"
//                   disabled={isSubmitting}
//                   className="px-4 py-2 bg-teal-600 text-white font-medium rounded-md shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
//                 >
//                   {isSubmitting ? 'Saving...' : 'Save changes'}
//                 </button>
//               </div>
//             </form>

//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default withAuth(MyAccountPage);

// app/my-account/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/nextAuthOptions";
import { redirect } from "next/navigation";
import MyAccountClient from "./MyAccountClient";

export default async function MyAccountPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    // Not logged in – send to login, then back to /my-account
    redirect("/dashboard/settings");
  }

  return <MyAccountClient initialUser={session.user} />;
}
