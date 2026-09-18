import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Cog } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isLoading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Account created successfully. You can now sign in.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully.");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred during authentication.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row">
      {/* Left side - Dark Navy Engineering Aesthetic */}
      <div className="hidden md:flex flex-col flex-1 bg-slate-900 p-12 text-white relative overflow-hidden">
        {/* Subtle grid background */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{ 
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)', 
            backgroundSize: '40px 40px' 
          }} 
        />
        
        <div className="z-10 flex flex-col h-full">
          <div className="flex items-center gap-3 font-bold text-3xl">
            <Cog className="w-10 h-10 text-indigo-400" />
            <span>CNC Vault</span>
          </div>
          
          <div className="mt-auto mb-auto max-w-lg">
            <h1 className="text-4xl font-semibold mb-4 leading-tight">
              Engineering Drawing &<br />Document Control
            </h1>
            <p className="text-slate-400 text-lg">
              Securely manage parts, drawings, revisions, and access control in one centralized enterprise vault.
            </p>
          </div>
          
          <div className="mt-auto flex items-center gap-2 text-slate-500 text-sm">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            <span>Enterprise Grade Security</span>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          
          <div className="text-center mb-8">
            <div className="flex md:hidden items-center justify-center gap-2 font-bold text-2xl text-slate-900 mb-6">
              <Cog className="w-8 h-8 text-indigo-600" />
              <span>CNC Vault</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {isSignUp ? "Create an account" : "Welcome back"}
            </h2>
            <p className="text-slate-500 mt-2 text-sm">
              {isSignUp ? "Enter your details to register" : "Please sign in to your account"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="engineering@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                {!isSignUp && (
                  <button 
                    type="button" 
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    onClick={() => toast.info("Please contact your administrator to reset your password.")}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? "Sign Up" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </span>{" "}
            <button
              type="button"
              className="text-indigo-600 hover:text-indigo-800 font-medium"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
