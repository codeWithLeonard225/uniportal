import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/app/lib/firebaseAdmin';
export const runtime = 'nodejs';

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const accountCollections = [
  {
    name: 'students',
    idField: 'studentId',
    nameFields: ['fullName'],
    role: 'student',
  },
  {
    name: 'staff',
    idField: 'staffId',
    nameFields: ['fullName'],
    role: 'staff',
  },
  {
    name: 'Admins',
    idField: 'adminID',
    nameFields: ['adminName', 'fullName'],
    role: 'admin',
  },
  {
    name: 'CEOs',
    idField: 'ceoID',
    nameFields: ['ceoName', 'fullName'],
    role: 'ceo',
  },
  {
    name: 'Classes',
    idField: 'classId',
    nameFields: ['className'],
    role: 'class',
  },
];

// Return only fields needed by the portal.
// Add other non-sensitive fields here if your pages need them.
function safeUserData(data, role, documentId, institutionID) {
  const allowedFields = [
    'studentId',
    'staffId',
    'adminID',
    'ceoID',
    'classId',
    'fullName',
    'adminName',
    'ceoName',
    'className',
    'email',
    'gmail',
    'googleEmail',
    'adminType',
    'institutionID',
    'schoolId',
    'phone',
    'photoURL',
    'profilePicture',
    'programmeID',
    'programmeName',
    'department',
    'studyLevel',
    'status',
  ];

  const safeData = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      safeData[field] = data[field];
    }
  }

  return {
    ...safeData,
    id: documentId,
    role,
    institutionID: institutionID || null,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();

    const { idToken, userID, userName } = body;

    if (!idToken || !userID || !userName) {
      return NextResponse.json(
        { success: false, message: 'Missing login information.' },
        { status: 400 }
      );
    }

    // 1. Verify the Firebase ID token.
    const decodedToken = await adminAuth.verifyIdToken(idToken, true);

    // 2. Only allow Google-authenticated accounts.
    if (
      decodedToken.firebase?.sign_in_provider !== 'google.com' ||
      !decodedToken.email ||
      decodedToken.email_verified !== true
    ) {
      return NextResponse.json(
        { success: false, message: 'Please use a verified Google account.' },
        { status: 401 }
      );
    }

    const googleEmail = normalize(decodedToken.email);
    const enteredID = String(userID).trim();
    const enteredName = normalize(userName);

    let matchedRecord = null;
    let matchedConfig = null;

    // 3. Search the portal collections on the server.
    for (const config of accountCollections) {
      const snapshot = await adminDb
        .collection(config.name)
        .where(config.idField, '==', enteredID)
        .get();

      for (const document of snapshot.docs) {
        const data = document.data();

        const storedName = config.nameFields
          .map((field) => data[field])
          .find((value) => value && normalize(value) === enteredName);

        const assignedEmail = normalize(
          data.email || data.gmail || data.googleEmail || ''
        );

        if (storedName && assignedEmail === googleEmail) {
          matchedRecord = {
            id: document.id,
            data,
          };

          matchedConfig = config;
          break;
        }
      }

      if (matchedRecord) break;
    }

    // Use a general error so the endpoint does not reveal which
    // part of an account lookup was incorrect.
    if (!matchedRecord) {
      return NextResponse.json(
        {
          success: false,
          message: 'The login details could not be verified.',
        },
        { status: 403 }
      );
    }

    // 4. Resolve the institution ID from the matched account.
    const data = matchedRecord.data;

    const institutionID =
      data.institutionID || data.schoolId || null;

    // 5. Retrieve institution information, if available.
    let institution = null;

    if (institutionID) {
      let institutionDoc = await adminDb
        .collection('institutions')
        .doc(String(institutionID))
        .get();

      if (!institutionDoc.exists) {
        const institutionQuery = await adminDb
          .collection('institutions')
          .where('institutionID', '==', institutionID)
          .limit(1)
          .get();

        if (!institutionQuery.empty) {
          institutionDoc = institutionQuery.docs[0];
        }
      }

      if (institutionDoc.exists) {
        const institutionData = institutionDoc.data();

        institution = {
          institutionID:
            institutionData.institutionID || institutionDoc.id,
          institutionName: institutionData.institutionName || '',
          logo: institutionData.logo || '',
          address: institutionData.address || '',
          motto: institutionData.motto || '',
          contact: institutionData.contact || '',
          email: institutionData.email || '',
          type: institutionData.type || '',
          headName: institutionData.headName || '',
        };
      }
    }

    // 6. Create a secure, HTTP-only session cookie.
    const expiresIn = 5 * 24 * 60 * 60 * 1000;

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Login verified successfully.',
      user: safeUserData(
        data,
        matchedConfig.role,
        matchedRecord.id,
        institutionID
      ),
      institution,
    });

    response.cookies.set('portal_session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresIn / 1000,
    });

    return response;
  } catch (error) {
    console.error('Portal verification error:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Unable to verify your login. Please try again.',
      },
      { status: 401 }
    );
  }
}