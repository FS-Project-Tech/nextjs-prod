// "use client";

// import { useUser } from '@/hooks/useUser';
// import { useQuery } from '@tanstack/react-query';
// import { useEffect, useState } from 'react';
// import withAuth, { WithAuthProps } from '@/lib/withAuth';

// function DashboardOverview({ user: authUser }: WithAuthProps) {
//   const { user, loading: userLoading } = useUser();
//   const [lastLogin, setLastLogin] = useState<string | null>(null);
//   const [mounted, setMounted] = useState(false);

//   // Fetch last login from localStorage or API
//   useEffect(() => {
//     setMounted(true);
//     const stored = localStorage.getItem('lastLogin');
//     if (stored) {
//       setLastLogin(new Date(stored).toLocaleString());
//     } else {
//       const now = new Date();
//       setLastLogin(now.toLocaleString());
//       localStorage.setItem('lastLogin', now.toISOString());
//     }
//   }, []);

//   // Fetch customer stats
//   const { data: customerData, isLoading: isLoadingStats, error: statsError } = useQuery({
//     queryKey: ['customer-stats'],
//     queryFn: async () => {
//       const response = await fetch('/api/dashboard/customer', {
//         credentials: 'include',
//         cache: 'no-store',
//       });
//       if (response.ok) {
//         const data = await response.json();
//         // Log for debugging
//         if (process.env.NODE_ENV === 'development') {
//           console.log('Customer stats:', data);
//         }
//         return data;
//       }
//       const errorData = await response.json().catch(() => ({}));
//       throw new Error(errorData.error || `Failed to fetch stats: ${response.status}`);
//     },
//     staleTime: 5 * 60 * 1000, // 5 minutes
//     retry: 1,
//   });

//   if (userLoading) {
//     return (
//       <div className="flex items-center justify-center py-12">
//         <div className="text-center">
//           <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
//           <p className="mt-4 text-gray-600">Loading user data...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6">
//       {/* Welcome Section */}
//       <div className="bg-gradient-to-r from-teal-500 to-teal-700 rounded-lg p-8 text-white">
//         <h1 className="text-3xl font-bold mb-2" suppressHydrationWarning>
//           Welcome back, {mounted && user?.name ? user.name : 'User'}!
//         </h1>
//         <p className="text-teal-100">
//           Here&apos;s an overview of your account activity
//         </p>
//       </div>

//       {/* Stats Grid */}
//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//         <div className="bg-white rounded-lg shadow p-6">
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-sm text-gray-500">Total Orders</p>
//               {isLoadingStats ? (
//                 <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mt-1"></div>
//               ) : (
//                 <p className="text-2xl font-bold text-gray-900 mt-1">
//                   {customerData?.orders_count ?? customerData?.order_count ?? 0}
//                 </p>
//               )}
//             </div>
//             <svg className="h-6 w-6" fill="none" stroke="#0f766e" viewBox="0 0 24 24">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
//             </svg>
//           </div>
//         </div>

//         <div className="bg-white rounded-lg shadow p-6">
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="text-sm text-gray-500">Total Spent</p>
//               {isLoadingStats ? (
//                 <div className="h-8 w-24 bg-gray-200 animate-pulse rounded mt-1"></div>
//               ) : (
//                 <p className="text-2xl font-bold text-gray-900 mt-1">
//                   {customerData?.total_spent
//                     ? `${customerData.currency || 'AUD'} ${parseFloat(customerData.total_spent).toFixed(2)}`
//                     : 'AUD 0.00'}
//                 </p>
//               )}
//             </div>
//             <svg className="h-6 w-6" fill="#0f766e" viewBox="0 0 24 24">
//               <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" />
//             </svg>
//           </div>
//         </div>
//       </div>

//       {statsError && (
//         <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
//           <p className="text-yellow-800 text-sm">
//             Note: Unable to load some statistics. {statsError.message}
//           </p>
//         </div>
//       )}

//       {/* Profile Info */}
//       <div className="bg-white rounded-lg shadow p-6">
//         <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
//         <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
//           <div>
//             <dt className="text-sm font-medium text-gray-500">Name</dt>
//             <dd className="mt-1 text-sm text-gray-900">{user?.name || 'N/A'}</dd>
//           </div>
//           <div>
//             <dt className="text-sm font-medium text-gray-500">Email</dt>
//             <dd className="mt-1 text-sm text-gray-900">{user?.email || 'N/A'}</dd>
//           </div>
//           {user?.username && (
//             <div>
//               <dt className="text-sm font-medium text-gray-500">Username</dt>
//               <dd className="mt-1 text-sm text-gray-900">{user.username}</dd>
//             </div>
//           )}
//           <div>
//             <dt className="text-sm font-medium text-gray-500">Role</dt>
//             <dd className="mt-1 text-sm text-gray-900">
//               {user?.roles?.join(', ') || 'Customer'}
//             </dd>
//           </div>
//           <div>
//             <dt className="text-sm font-medium text-gray-500">Last Login</dt>
//             <dd className="mt-1 text-sm text-gray-900" suppressHydrationWarning>
//               {mounted ? (lastLogin || 'N/A') : 'N/A'}
//             </dd>
//           </div>
//           <div>
//             <dt className="text-sm font-medium text-gray-500">Member Since</dt>
//             <dd className="mt-1 text-sm text-gray-900" suppressHydrationWarning>
//               {mounted && customerData?.date_created
//                 ? new Date(customerData.date_created).toLocaleDateString()
//                 : 'N/A'}
//             </dd>
//           </div>
//         </dl>
//       </div>
//     </div>
//   );
// }

// // Export the protected component
// export default withAuth(DashboardOverview);

// app/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/nextAuthOptions";
import { redirect } from "next/navigation";
import DashboardOverviewClient from "./DashboardOverviewClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    // Not logged in – send to your login page
    redirect("/login");
  }

  // You can pass some initial data if you want
  return <DashboardOverviewClient initialUser={session.user} />;
}
