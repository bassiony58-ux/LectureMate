import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CreditCard, User, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { user, loading, signOut, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const { language, isRTL } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "billing" | "security">("general");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const t = {
    title: language === "ar" ? "الملف الشخصي والإعدادات" : "Profile & Settings",
    subtitle: language === "ar" ? "إدارة إعدادات حسابك وتفضيلاتك." : "Manage your account settings and preferences.",
    general: language === "ar" ? "عام" : "General",
    billing: language === "ar" ? "الفوترة والاشتراك" : "Billing & Subscription",
    security: language === "ar" ? "الأمان" : "Security",
    profileInfo: language === "ar" ? "معلومات الملف الشخصي" : "Profile Information",
    profileDesc: language === "ar" ? "قم بتحديث بياناتك الشخصية." : "Update your personal details.",
    firstName: language === "ar" ? "الاسم الأول" : "First name",
    lastName: language === "ar" ? "اسم العائلة" : "Last name",
    email: language === "ar" ? "البريد الإلكتروني" : "Email",
    emailCannotChange: language === "ar" ? "لا يمكن تغيير البريد الإلكتروني" : "Email cannot be changed",
    saving: language === "ar" ? "جاري الحفظ..." : "Saving...",
    saveChanges: language === "ar" ? "حفظ التغييرات" : "Save Changes",
    subscriptionPlan: language === "ar" ? "خطة الاشتراك" : "Subscription Plan",
    proPlanDesc: language === "ar" ? "أنت حالياً على الخطة الاحترافية." : "You are currently on the Pro plan.",
    proPlan: language === "ar" ? "الخطة الاحترافية" : "Pro Plan",
    active: language === "ar" ? "نشط" : "Active",
    proPlanFeatures: language === "ar" ? "محاضرات غير محدودة، اختبارات متقدمة، ودعم ذو أولوية." : "Unlimited lectures, advanced quizzes, and priority support.",
    manageSubscription: language === "ar" ? "إدارة الاشتراك" : "Manage Subscription",
    currentPlan: language === "ar" ? "الخطة الحالية" : "Current Plan",
    nextBilling: language === "ar" ? "تاريخ التجديد القادم" : "Next Billing Date",
    nextBillingDate: language === "ar" ? "15 يناير 2025" : "January 15, 2025",
    paymentMethod: language === "ar" ? "طريقة الدفع" : "Payment Method",
    paymentMethodDesc: language === "ar" ? "بطاقة ائتمانية •••• 4242" : "Credit Card •••• 4242",
    updatePayment: language === "ar" ? "تحديث طريقة الدفع" : "Update Payment Method",
    signOut: language === "ar" ? "تسجيل الخروج" : "Sign Out",
    loading: language === "ar" ? "جاري التحميل..." : "Loading...",
    pleaseSignIn: language === "ar" ? "يرجى تسجيل الدخول لعرض ملفك الشخصي." : "Please sign in to view your profile.",
    success: language === "ar" ? "نجح!" : "Success!",
    profileUpdated: language === "ar" ? "تم تحديث ملفك الشخصي." : "Your profile has been updated.",
    error: language === "ar" ? "خطأ" : "Error",
    updateFailed: language === "ar" ? "فشل تحديث الملف الشخصي. يرجى المحاولة مرة أخرى." : "Failed to update profile. Please try again.",
    signedOut: language === "ar" ? "تم تسجيل الخروج" : "Signed out",
    signedOutDesc: language === "ar" ? "تم تسجيل خروجك بنجاح." : "You've been signed out successfully.",
    signOutFailed: language === "ar" ? "فشل تسجيل الخروج. يرجى المحاولة مرة أخرى." : "Failed to sign out. Please try again.",
    user: language === "ar" ? "مستخدم" : "User",
  };

  useEffect(() => {
    if (user) {
      const nameParts = user.displayName?.split(" ") || [];
      setFirstName(nameParts[0] || "");
      setLastName(nameParts.slice(1).join(" ") || "");
      setEmail(user.email || "");
      setDisplayName(user.displayName || "");
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const newDisplayName = `${firstName} ${lastName}`.trim() || displayName;
      await updateUserProfile(newDisplayName || undefined);
      // Update local state to reflect changes
      setDisplayName(newDisplayName);
      toast({
        title: t.success,
        description: t.profileUpdated,
      });
    } catch (error: any) {
      toast({
        title: t.error,
        description: error.message || t.updateFailed,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleManageSubscription = () => {
    toast({
      title: language === "ar" ? "قريباً" : "Coming Soon",
      description: language === "ar" ? "ستكون هذه الميزة متاحة قريباً." : "This feature will be available soon.",
    });
  };

  const handleUpdatePayment = () => {
    toast({
      title: language === "ar" ? "قريباً" : "Coming Soon",
      description: language === "ar" ? "ستكون هذه الميزة متاحة قريباً." : "This feature will be available soon.",
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: t.signedOut,
        description: t.signedOutDesc,
      });
    } catch (error: any) {
      toast({
        title: t.error,
        description: error.message || t.signOutFailed,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">{t.loading}</div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">{t.pleaseSignIn}</p>
          </div>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-[250px_1fr]">
          <nav className="flex flex-col space-y-1">
            <Button 
              variant={activeTab === "general" ? "secondary" : "ghost"} 
              className={cn("justify-start", isRTL && "flex-row-reverse")}
              onClick={() => setActiveTab("general")}
            >
              <User className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
              {t.general}
            </Button>
            <Button 
              variant={activeTab === "billing" ? "secondary" : "ghost"} 
              className={cn("justify-start", isRTL && "flex-row-reverse")}
              onClick={() => setActiveTab("billing")}
            >
              <CreditCard className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
              {t.billing}
            </Button>
            <Button 
              variant={activeTab === "security" ? "secondary" : "ghost"} 
              className={cn("justify-start", isRTL && "flex-row-reverse")}
              onClick={() => setActiveTab("security")}
            >
              <Shield className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
              {t.security}
            </Button>
          </nav>
          
          <div className="space-y-6">
            {activeTab === "general" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t.profileInfo}</CardTitle>
                  <CardDescription>{t.profileDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                <div className={cn("flex items-center gap-4", isRTL && "flex-row-reverse")}>
                  <Avatar className="h-20 w-20 border-2 border-primary/20">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                      {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-base font-semibold">{user.displayName || t.user}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t.firstName}</Label>
                    <Input 
                      id="firstName" 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      dir={isRTL ? "rtl" : "ltr"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t.lastName}</Label>
                    <Input 
                      id="lastName" 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      dir={isRTL ? "rtl" : "ltr"}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">{t.email}</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email}
                    disabled
                    className="bg-muted"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">{t.emailCannotChange}</p>
                </div>

                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? t.saving : t.saveChanges}
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeTab === "billing" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t.subscriptionPlan}</CardTitle>
                  <CardDescription>{t.proPlanDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Current Plan */}
                  <div className={cn("flex items-center justify-between p-4 border rounded-lg bg-secondary/10", isRTL && "flex-row-reverse")}>
                    <div className="space-y-1">
                      <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                        <span className="font-semibold">{t.proPlan}</span>
                        <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">{t.active}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{t.proPlanFeatures}</p>
                    </div>
                    <Button variant="outline" onClick={handleManageSubscription}>
                      {t.manageSubscription}
                    </Button>
                  </div>

                  {/* Billing Details */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t.nextBilling}</Label>
                      <p className="text-sm text-muted-foreground">{t.nextBillingDate}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t.paymentMethod}</Label>
                      <p className="text-sm text-muted-foreground">{t.paymentMethodDesc}</p>
                    </div>
                  </div>

                  {/* Update Payment Button */}
                  <Button variant="outline" className="w-full" onClick={handleUpdatePayment}>
                    {t.updatePayment}
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeTab === "security" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t.security}</CardTitle>
                  <CardDescription>
                    {language === "ar" ? "إدارة إعدادات الأمان لحسابك." : "Manage security settings for your account."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {language === "ar" ? "البريد الإلكتروني" : "Email"}
                      </Label>
                      <Input 
                        type="email" 
                        value={email}
                        disabled
                        className="bg-muted"
                        dir="ltr"
                      />
                      <p className="text-xs text-muted-foreground">
                        {language === "ar" ? "البريد الإلكتروني مرتبط بحسابك ولا يمكن تغييره." : "Email is linked to your account and cannot be changed."}
                      </p>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {language === "ar" ? "تغيير كلمة المرور" : "Change Password"}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {language === "ar" 
                          ? "استخدم رابط 'نسيت كلمة المرور' في صفحة تسجيل الدخول لتغيير كلمة المرور."
                          : "Use the 'Forgot Password' link on the sign-in page to change your password."}
                      </p>
                      <Button variant="outline" onClick={() => {
                        toast({
                          title: language === "ar" ? "تغيير كلمة المرور" : "Change Password",
                          description: language === "ar" 
                            ? "يرجى استخدام رابط 'نسيت كلمة المرور' في صفحة تسجيل الدخول."
                            : "Please use the 'Forgot Password' link on the sign-in page.",
                        });
                      }}>
                        {language === "ar" ? "إعادة تعيين كلمة المرور" : "Reset Password"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className={cn("flex", isRTL ? "justify-start" : "justify-end")}>
              <Button variant="destructive" className="w-full md:w-auto" onClick={handleSignOut}>
                  <LogOut className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                  {t.signOut}
                </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
