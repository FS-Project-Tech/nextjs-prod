// import { NextRequest, NextResponse } from 'next/server';
// import { getWpBaseUrl } from '@/lib/auth';
// import { getAuthToken } from '@/lib/auth-server';
// import wcAPI from '@/lib/woocommerce';
// import { getCustomerData, getCustomerIdWithFallback } from '@/lib/customer';

// /**
//  * GET /api/dashboard/profile
//  * Fetch user profile and WooCommerce customer data
//  */
// export async function GET(req: NextRequest) {
//   try {
//     const token = await getAuthToken();

//     if (!token) {
//       console.error('Profile GET: No token found in cookies');
//       return NextResponse.json(
//         { error: 'Not authenticated' },
//         { status: 401 }
//       );
//     }

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       console.error('Profile GET: WordPress URL not configured');
//       return NextResponse.json(
//         { error: 'WordPress URL not configured' },
//         { status: 500 }
//       );
//     }

//     // Get user data
//     const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       cache: 'no-store',
//     });

//     if (!userResponse.ok) {
//       // Check if response body exists before reading
//       let errorText = '';
//       if (userResponse.body) {
//         try {
//           errorText = await userResponse.text();
//         } catch (e) {
//           // Ignore errors reading response body
//         }
//       }
//       console.error('Profile GET: Failed to get user data', {
//         status: userResponse.status,
//         statusText: userResponse.statusText,
//         error: errorText,
//       });
//       return NextResponse.json(
//         { error: 'Failed to get user data', details: errorText },
//         { status: 401 }
//       );
//     }

//     // Check if response body exists before reading
//     if (!userResponse.body) {
//       return NextResponse.json(
//         { error: 'No response body received' },
//         { status: 500 }
//       );
//     }

//     const user = await userResponse.json();

//     // Get WooCommerce customer data using optimized hybrid approach
//     let customerData = null;
//     try {
//       customerData = await getCustomerData(user.email, token);
//     } catch (wcError: any) {
//       console.error('Error fetching WooCommerce customer:', wcError.message);
//     }

//     const wpUser = user as any;
//     return NextResponse.json({
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//         display_name: user.name,
//         username: user.slug || user.user_login,
//         roles: user.roles || [],
//         birth_date: user.birth_date ?? (customerData as any)?.meta?.birth_date ?? null,
//         first_name: wpUser.meta?.first_name ?? wpUser.first_name ?? (customerData?.first_name || ''),
//         last_name: wpUser.meta?.last_name ?? wpUser.last_name ?? (customerData?.last_name || ''),
//       },
//       customer: customerData ? {
//         id: customerData.id,
//         first_name: customerData.first_name || '',
//         last_name: customerData.last_name || '',
//         email: customerData.email || user.email,
//         username: customerData.username || user.slug,
//         date_created: customerData.date_created,
//         billing: customerData.billing || {},
//         shipping: customerData.shipping || {},
//         meta: (customerData as any)?.meta || {},
//       } : null,
//     });
//   } catch (error) {
//     console.error('Profile fetch error:', error);
//     return NextResponse.json(
//       { error: 'An error occurred while fetching profile' },
//       { status: 500 }
//     );
//   }
// }

// /**
//  * PUT /api/dashboard/profile
//  * Update user profile information
//  */
// export async function PUT(req: NextRequest) {
//   try {
//     const token = await getAuthToken();

//     if (!token) {
//       return NextResponse.json(
//         { error: 'Not authenticated' },
//         { status: 401 }
//       );
//     }

//     const body = await req.json();
//     const {
//       first_name,
//       last_name,
//       display_name,
//       email,
//       phone,
//       company,
//       billing,
//       shipping,
//     } = body;

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       return NextResponse.json(
//         { error: 'WordPress URL not configured' },
//         { status: 500 }
//       );
//     }

//     // Get user data
//     const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       cache: 'no-store',
//     });

//     if (!userResponse.ok) {
//       return NextResponse.json(
//         { error: 'Failed to get user data' },
//         { status: 401 }
//       );
//     }

//     const user = await userResponse.json();

//     // Update WordPress user (name = display name)
//     const updateUserResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/${user.id}`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         email: email || user.email,
//         name: display_name ?? user.name,
//         meta: {
//           first_name: first_name || '',
//           last_name: last_name || '',
//         },
//       }),
//       cache: 'no-store',
//     });

//     if (!updateUserResponse.ok) {
//       const error = await updateUserResponse.json();
//       return NextResponse.json(
//         { error: (error instanceof Error ? error.message : 'An error occurred') || 'Failed to update user' },
//         { status: updateUserResponse.status }
//       );
//     }

//     // Update WooCommerce customer if exists
//     try {
//       const customer = await getCustomerData(user.email, token);

//       if (customer) {

//         // Prepare billing data
//         const billingData = billing ? {
//           first_name: billing.first_name || first_name || customer.billing?.first_name || '',
//           last_name: billing.last_name || last_name || customer.billing?.last_name || '',
//           company: billing.company || company || customer.billing?.company || '',
//           address_1: billing.address_1 || customer.billing?.address_1 || '',
//           address_2: billing.address_2 || customer.billing?.address_2 || '',
//           city: billing.city || customer.billing?.city || '',
//           state: billing.state || customer.billing?.state || '',
//           postcode: billing.postcode || customer.billing?.postcode || '',
//           country: billing.country || customer.billing?.country || '',
//           email: email || customer.billing?.email || customer.email || '',
//           phone: billing.phone || phone || customer.billing?.phone || '',
//         } : {
//           ...customer.billing,
//           first_name: first_name || customer.billing?.first_name || customer.first_name || '',
//           last_name: last_name || customer.billing?.last_name || customer.last_name || '',
//           company: company || customer.billing?.company || '',
//           email: email || customer.billing?.email || customer.email || '',
//           phone: phone || customer.billing?.phone || '',
//         };

//         // Prepare shipping data
//         const shippingData = shipping ? {
//           first_name: shipping.first_name || first_name || customer.shipping?.first_name || '',
//           last_name: shipping.last_name || last_name || customer.shipping?.last_name || '',
//           company: shipping.company || company || customer.shipping?.company || '',
//           address_1: shipping.address_1 || customer.shipping?.address_1 || '',
//           address_2: shipping.address_2 || customer.shipping?.address_2 || '',
//           city: shipping.city || customer.shipping?.city || '',
//           state: shipping.state || customer.shipping?.state || '',
//           postcode: shipping.postcode || customer.shipping?.postcode || '',
//           country: shipping.country || customer.shipping?.country || '',
//         } : {
//           ...customer.shipping,
//         };

//         // Update WooCommerce customer
//         const updateCustomerResponse = await wcAPI.put(`/customers/${customer.id}`, {
//           email: email || customer.email,
//           first_name: first_name || customer.first_name || '',
//           last_name: last_name || customer.last_name || '',
//           username: customer.username,
//           billing: billingData,
//           shipping: shippingData,
//         });

//         if (!updateCustomerResponse.data) {
//           console.error('Failed to update WooCommerce customer');
//         }
//       }
//     } catch (wcError: any) {
//       console.error('Error updating WooCommerce customer:', wcError.message);
//       // Don't fail the entire request if WooCommerce update fails
//     }

//     return NextResponse.json({
//       message: 'Profile updated successfully',
//       user: {
//         id: user.id,
//         email: email || user.email,
//         name: display_name || `${first_name || ''} ${last_name || ''}`.trim() || user.name,
//       },
//     });
//   } catch (error) {
//     console.error('Profile update error:', error);
//     return NextResponse.json(
//       { error: 'An error occurred while updating profile' },
//       { status: 500 }
//     );
//   }
// }

import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import wcAPI from "@/lib/woocommerce";
import { getCustomerData } from "@/lib/customer";
import { getToken } from "next-auth/jwt";

// GET /api/dashboard/profile
export async function GET(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      const errorText = userResponse.body ? await userResponse.text().catch(() => "") : "";
      console.error("Profile GET: Failed to get user data", {
        status: userResponse.status,
        statusText: userResponse.statusText,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Failed to get user data", details: errorText },
        { status: 401 }
      );
    }

    if (!userResponse.body) {
      return NextResponse.json({ error: "No response body received" }, { status: 500 });
    }

    const user = await userResponse.json();

    let customerData = null;
    try {
      customerData = await getCustomerData(user.email, token);
    } catch (wcError: any) {
      console.error("Error fetching WooCommerce customer:", wcError.message);
    }

    const wpUser = user as any;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        display_name: user.name,
        username: user.slug || user.user_login,
        roles: user.roles || [],
        birth_date: user.birth_date ?? (customerData as any)?.meta?.birth_date ?? null,
        first_name:
          wpUser.meta?.first_name ?? wpUser.first_name ?? (customerData?.first_name || ""),
        last_name: wpUser.meta?.last_name ?? wpUser.last_name ?? (customerData?.last_name || ""),
      },
      customer: customerData
        ? {
            id: customerData.id,
            first_name: customerData.first_name || "",
            last_name: customerData.last_name || "",
            email: customerData.email || user.email,
            username: customerData.username || user.slug,
            date_created: customerData.date_created,
            billing: customerData.billing || {},
            shipping: customerData.shipping || {},
            meta: (customerData as any)?.meta || {},
          }
        : null,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching profile" },
      { status: 500 }
    );
  }
}

// PUT /api/dashboard/profile
export async function PUT(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { first_name, last_name, display_name, email, phone, company, billing, shipping } = body;

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }

    const user = await userResponse.json();

    const updateUserResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/${user.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email || user.email,
        name: display_name ?? user.name,
        meta: {
          first_name: first_name || "",
          last_name: last_name || "",
        },
      }),
      cache: "no-store",
    });

    if (!updateUserResponse.ok) {
      const error = await updateUserResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            (error instanceof Error ? error.message : "An error occurred") ||
            "Failed to update user",
        },
        { status: updateUserResponse.status }
      );
    }

    try {
      const customer = (await getCustomerData(user.email, token)) as any;
      if (customer) {
        const billingData = billing
          ? {
              first_name: billing.first_name || first_name || customer.billing?.first_name || "",
              last_name: billing.last_name || last_name || customer.billing?.last_name || "",
              company: billing.company || company || customer.billing?.company || "",
              address_1: billing.address_1 || customer.billing?.address_1 || "",
              address_2: billing.address_2 || customer.billing?.address_2 || "",
              city: billing.city || customer.billing?.city || "",
              state: billing.state || customer.billing?.state || "",
              postcode: billing.postcode || customer.billing?.postcode || "",
              country: billing.country || customer.billing?.country || "",
              email: email || customer.billing?.email || customer.email || "",
              phone: billing.phone || phone || customer.billing?.phone || "",
            }
          : {
              ...customer.billing,
              first_name: first_name || customer.billing?.first_name || customer.first_name || "",
              last_name: last_name || customer.billing?.last_name || customer.last_name || "",
              company: company || customer.billing?.company || "",
              email: email || customer.billing?.email || customer.email || "",
              phone: phone || customer.billing?.phone || "",
            };

        const shippingData = shipping
          ? {
              first_name: shipping.first_name || first_name || customer.shipping?.first_name || "",
              last_name: shipping.last_name || last_name || customer.shipping?.last_name || "",
              company: shipping.company || company || customer.shipping?.company || "",
              address_1: shipping.address_1 || customer.shipping?.address_1 || "",
              address_2: shipping.address_2 || customer.shipping?.address_2 || "",
              city: shipping.city || customer.shipping?.city || "",
              state: shipping.state || customer.shipping?.state || "",
              postcode: shipping.postcode || customer.shipping?.postcode || "",
              country: shipping.country || customer.shipping?.country || "",
            }
          : {
              ...customer.shipping,
            };

        await wcAPI.put(`/customers/${customer.id}`, {
          email: email || customer.email,
          first_name: first_name || customer.first_name || "",
          last_name: last_name || customer.last_name || "",
          username: customer.username,
          billing: billingData,
          shipping: shippingData,
        });
      }
    } catch (wcError: any) {
      console.error("Error updating WooCommerce customer:", wcError.message);
    }

    return NextResponse.json({
      message: "Profile updated successfully",
      user: {
        id: user.id,
        email: email || user.email,
        name: display_name || `${first_name || ""} ${last_name || ""}`.trim() || user.name,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "An error occurred while updating profile" },
      { status: 500 }
    );
  }
}
