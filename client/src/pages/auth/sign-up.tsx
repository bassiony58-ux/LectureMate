import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function SignUp() {
  const { signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const { language, isRTL } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const calculatePasswordStrength = (pwd: string) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z\d]/.test(pwd)) strength++;
    return Math.min(strength, 4);
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordStrength(calculatePasswordStrength(value));
  };

  const t = {
    title: language === "ar" ? "إنشاء حساب جديد" : "Create an account",
    description: language === "ar" ? "أدخل بياناتك للبدء مع LectureMate" : "Enter your details to get started with LectureMate",
    firstName: language === "ar" ? "الاسم الأول" : "First name",
    lastName: language === "ar" ? "اسم العائلة" : "Last name",
    email: language === "ar" ? "البريد الإلكتروني" : "Email",
    password: language === "ar" ? "كلمة المرور" : "Password",
    signUp: language === "ar" ? "إنشاء الحساب" : "Sign Up",
    creatingAccount: language === "ar" ? "جاري إنشاء الحساب..." : "Creating account...",
    orContinue: language === "ar" ? "أو المتابعة مع" : "Or continue with",
    haveAccount: language === "ar" ? "لديك حساب بالفعل؟" : "Already have an account?",
    signIn: language === "ar" ? "تسجيل الدخول" : "Sign in",
    success: language === "ar" ? "نجح!" : "Success!",
    successDesc: language === "ar" ? "تم إنشاء حسابك بنجاح." : "Your account has been created successfully.",
    error: language === "ar" ? "خطأ" : "Error",
    errorDesc: language === "ar" ? "فشل إنشاء الحساب. يرجى المحاولة مرة أخرى." : "Failed to create account. Please try again.",
    googleError: language === "ar" ? "فشل تسجيل الدخول باستخدام Google. يرجى المحاولة مرة أخرى." : "Failed to sign in with Google. Please try again.",
    passwordWeak: language === "ar" ? "ضعيفة" : "Weak",
    passwordFair: language === "ar" ? "متوسطة" : "Fair",
    passwordGood: language === "ar" ? "جيدة" : "Good",
    passwordStrong: language === "ar" ? "قوية" : "Strong",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const displayName = `${firstName} ${lastName}`.trim();
      await signUp(email, password, displayName || undefined);
      toast({
        title: t.success,
        description: t.successDesc,
      });
    } catch (error: any) {
      toast({
        title: t.error,
        description: error.message || t.errorDesc,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast({
        title: t.success,
        description: language === "ar" ? "تم تسجيل الدخول باستخدام Google." : "You've been signed in with Google.",
      });
    } catch (error: any) {
      toast({
        title: t.error,
        description: error.message || t.googleError,
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const getPasswordStrengthLabel = () => {
    if (passwordStrength === 0) return "";
    if (passwordStrength === 1) return t.passwordWeak;
    if (passwordStrength === 2) return t.passwordFair;
    if (passwordStrength === 3) return t.passwordGood;
    return t.passwordStrong;
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength <= 1) return "bg-red-500";
    if (passwordStrength === 2) return "bg-yellow-500";
    if (passwordStrength === 3) return "bg-blue-500";
    return "bg-green-500";
  };

  return (
    <div className={cn("min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4 py-8", isRTL && "rtl")}>
      {/* Simple Background - matching home page style */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="w-full border-2 shadow-2xl shadow-primary/20 overflow-hidden bg-card/50 backdrop-blur-sm hover:shadow-primary/30 transition-all duration-300">
          <CardHeader className="space-y-1 text-center pb-6">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <Video size={24} strokeWidth={3} />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <CardTitle className="text-2xl font-bold">
                {t.title}
              </CardTitle>
              <CardDescription className="text-sm mt-2">
                {t.description}
              </CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first-name" className="text-sm font-medium">
                    {t.firstName}
                  </Label>
                  <Input 
                    id="first-name" 
                    placeholder={language === "ar" ? "محمد" : "John"}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="h-10"
                    dir={isRTL ? "rtl" : "ltr"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name" className="text-sm font-medium">
                    {t.lastName}
                  </Label>
                  <Input 
                    id="last-name" 
                    placeholder={language === "ar" ? "أحمد" : "Doe"}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="h-10"
                    dir={isRTL ? "rtl" : "ltr"}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {t.email}
                </Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder={language === "ar" ? "example@email.com" : "m@example.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10"
                  dir={isRTL ? "rtl" : "ltr"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t.password}
                </Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    placeholder={language === "ar" ? "••••••••" : "••••••••"}
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    required
                    className="h-10 pr-10"
                    dir={isRTL ? "rtl" : "ltr"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",
                      isRTL ? "left-3" : "right-3"
                    )}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{language === "ar" ? "قوة كلمة المرور:" : "Password strength:"}</span>
                      <span className={cn(
                        "font-medium",
                        passwordStrength <= 1 && "text-red-500",
                        passwordStrength === 2 && "text-yellow-500",
                        passwordStrength === 3 && "text-blue-500",
                        passwordStrength >= 4 && "text-green-500"
                      )}>
                        {getPasswordStrengthLabel()}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={cn(
                            "flex-1 rounded-full transition-all",
                            level <= passwordStrength 
                              ? getPasswordStrengthColor() 
                              : "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || isGoogleLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                    />
                    {t.creatingAccount}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {t.signUp}
                    <ArrowRight className={cn("w-4 h-4", isRTL && "rotate-180")} />
                  </span>
                )}
              </Button>
            </form>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t.orContinue}
                </span>
              </div>
            </div>

            <Button 
              variant="outline" 
              type="button" 
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
            >
              {isGoogleLoading ? (
                <span className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                  />
                  {t.creatingAccount}
                </span>
              ) : (
                <span className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google
                </span>
              )}
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <p className={cn("text-sm text-muted-foreground", isRTL && "text-right")}>
              {t.haveAccount}{" "}
              <Link href="/sign-in" className="text-primary hover:underline font-medium">
                {t.signIn}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
