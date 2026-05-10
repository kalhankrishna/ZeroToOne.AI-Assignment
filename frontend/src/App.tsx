import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Lazy-loaded pages
const LoginPage = lazy(() => import("./pages/Login"));
const RegisterPage = lazy(() => import("./pages/Register"));
const ConversationLayout = lazy(() => import("./pages/ConversationLayout"));
const ConversationIndex = lazy(() => import("./pages/ConversationIndex"));
const ChatPage = lazy(() => import("./pages/Chat"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsers"));
const NotFoundPage = lazy(() => import("./pages/NotFound"));

function SuspenseFallback() {
  return <div className="page-center">Loading...</div>;
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SuspenseFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const router = createBrowserRouter([
  // Public routes
  {
    path: "/login",
    element: (
      <LazyPage>
        <LoginPage />
      </LazyPage>
    ),
  },
  {
    path: "/register",
    element: (
      <LazyPage>
        <RegisterPage />
      </LazyPage>
    ),
  },

  // Protected: conversations
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/conversations",
        element: (
          <LazyPage>
            <ConversationLayout />
          </LazyPage>
        ),
        children: [
          {
            index: true,
            element: (
              <LazyPage>
                <ConversationIndex />
              </LazyPage>
            ),
          },
          {
            path: ":id",
            element: (
              <LazyPage>
                <ChatPage />
              </LazyPage>
            ),
          },
        ],
      },
    ],
  },

  // Protected: admin
  {
    element: <ProtectedRoute adminOnly />,
    children: [
      {
        path: "/admin/users",
        element: (
          <LazyPage>
            <AdminUsersPage />
          </LazyPage>
        ),
      },
    ],
  },

  // Redirects & catch-all
  { path: "/", element: <Navigate to="/conversations" replace /> },
  {
    path: "*",
    element: (
      <LazyPage>
        <NotFoundPage />
      </LazyPage>
    ),
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}