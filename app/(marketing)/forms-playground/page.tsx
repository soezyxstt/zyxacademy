"use client";

import * as React from "react";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { SectionContainer } from "@/components/layout/section-container";
import { Reveal } from "@/components/ui/reveal";
import { InputField } from "@/components/ui/input-field";
import { SelectField } from "@/components/ui/select-field";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { FileUploadField } from "@/components/ui/file-upload-field";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default function FormsPlaygroundPage() {
  // Form states
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [age, setAge] = React.useState("");
  const [course, setCourse] = React.useState("");
  const [uploadedFiles, setUploadedFiles] = React.useState<File[]>([]);
  const [agreed, setAgreed] = React.useState<boolean | "indeterminate">(false);

  // Validation/Error states
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Dropdown options
  const courseOptions = [
    { value: "tpb-kalkulus-1", label: "TPB Kalkulus I" },
    { value: "tpb-fisika-1a", label: "TPB Fisika Dasar IA" },
    { value: "tpb-kimia-1a", label: "TPB Kimia Dasar IA" },
    { value: "if-struktur-data", label: "IF Struktur Data" },
  ];

  // Manual validation checker
  const validateForm = (vals: {
    fullName: string;
    email: string;
    password: string;
    age: string;
    course: string;
    files: File[];
    agreed: boolean | "indeterminate";
  }) => {
    const errs: Record<string, string> = {};

    if (!vals.fullName.trim()) {
      errs.fullName = "Full name is required.";
    } else if (vals.fullName.trim().length < 3) {
      errs.fullName = "Full name must be at least 3 characters.";
    }

    if (!vals.email.trim()) {
      errs.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vals.email)) {
      errs.email = "Please enter a valid email address.";
    }

    if (!vals.password) {
      errs.password = "Password is required.";
    } else if (vals.password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }

    if (!vals.age) {
      errs.age = "Age is required.";
    } else {
      const numAge = parseInt(vals.age, 10);
      if (isNaN(numAge) || numAge < 15 || numAge > 100) {
        errs.age = "Age must be a number between 15 and 100.";
      }
    }

    if (!vals.course) {
      errs.course = "Please select a course.";
    }

    if (vals.files.length === 0) {
      errs.files = "Please upload at least 1 document.";
    }

    if (vals.agreed !== true) {
      errs.agreed = "You must agree to the terms to proceed.";
    }

    return errs;
  };

  // Form submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const currentValues = {
      fullName,
      email,
      password,
      age,
      course,
      files: uploadedFiles,
      agreed,
    };

    const validationErrors = validateForm(currentValues);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast.error("Form validation failed. Please check the fields.");
      return;
    }

    setIsSubmitting(true);

    // Simulate server request
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success("Profile registration successful.");
      resetForm();
    }, 2000);
  };

  // Trigger errors to showcase visual states
  const handleToggleMockErrors = () => {
    setErrors({
      fullName: "Full name must be at least 3 characters.",
      email: "Please enter a valid email address.",
      password: "Password must be at least 8 characters.",
      age: "Age must be a number between 15 and 100.",
      course: "Please select a course.",
      files: "Please upload at least 1 document.",
      agreed: "You must agree to the terms to proceed.",
    });
    toast.error("Mock validation errors activated.");
  };

  // Reset form helper
  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setAge("");
    setCourse("");
    setUploadedFiles([]);
    setAgreed(false);
    setErrors({});
  };

  // Prepare files summary for state viewer
  const fileNames = uploadedFiles.map((f) => f.name);

  return (
    <div className="flex flex-col relative overflow-hidden bg-landing-dots">
      <PageOrnaments variant="about" />

      {/* Header section */}
      <Reveal>
        <header className="relative z-10 border-b border-border bg-background/50 backdrop-blur-xs py-16 text-center">
          <div className="marketing-container space-y-4">
            <h1 className="font-heading text-h5 sm:text-h4 font-bold tracking-tight text-foreground max-w-4xl mx-auto">
              Zyx Form Components Playground
            </h1>
            <p className="mx-auto max-w-2xl text-body-sm text-muted-foreground md:text-body-base leading-relaxed">
              Explore our responsive, custom, and keyboard-accessible form elements configured to fit the Zyx brand ecosystem.
            </p>
          </div>
        </header>
      </Reveal>

      {/* Interactive Playground Grid */}
      <SectionContainer className="relative z-10 py-12 marketing-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: The Form */}
          <div className="lg:col-span-7 space-y-6">
            <Reveal>
              <div className="bg-card border border-border shadow-sm rounded-xl p-6">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="font-heading text-h6 font-bold tracking-tight text-foreground">
                    Register Profile
                  </h2>
                  <p className="text-body-sm text-muted-foreground mt-1">
                    Fill in your credentials to join classes.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  
                  {/* Name field */}
                  <InputField
                    label="Full name"
                    description="Enter your legal name as recorded in your student profile."
                    placeholder="e.g. Adi Haditya Nursyam"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (errors.fullName) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.fullName;
                          return next;
                        });
                      }
                    }}
                    error={errors.fullName}
                    required
                  />

                  {/* Two column grid on sm screens for Email and Age */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="sm:col-span-2">
                      <InputField
                        label="Email address"
                        type="email"
                        placeholder="username@email.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.email;
                              return next;
                            });
                          }
                        }}
                        error={errors.email}
                        required
                      />
                    </div>
                    <div>
                      <InputField
                        label="Age"
                        type="number"
                        placeholder="18"
                        min="15"
                        max="100"
                        value={age}
                        onChange={(e) => {
                          setAge(e.target.value);
                          if (errors.age) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.age;
                              return next;
                            });
                          }
                        }}
                        error={errors.age}
                        required
                      />
                    </div>
                  </div>

                  {/* Password field with built-in toggle */}
                  <InputField
                    label="Password"
                    type="password"
                    placeholder="Enter security key"
                    description="Must be at least 8 characters long."
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.password;
                          return next;
                        });
                      }
                    }}
                    error={errors.password}
                    required
                  />

                  {/* Select course field */}
                  <SelectField
                    label="Select course"
                    description="Choose your primary tutoring subject."
                    placeholder="Select subject"
                    options={courseOptions}
                    value={course}
                    onValueChange={(val) => {
                      setCourse(val);
                      if (errors.course) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.course;
                          return next;
                        });
                      }
                    }}
                    error={errors.course}
                    required
                  />

                  {/* Drag and Drop File Upload field */}
                  <FileUploadField
                    label="Upload assignment"
                    description="Submit your solution files for review. Accepted formats: PDF or PNG."
                    accept={[".pdf", ".png"]}
                    maxSizeMB={5}
                    multiple={true}
                    onChange={(files) => {
                      setUploadedFiles(files);
                      if (errors.files) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.files;
                          return next;
                        });
                      }
                    }}
                    error={errors.files}
                    required
                  />

                  {/* Checkbox field */}
                  <CheckboxField
                    label={
                      <span>
                        Agree to the terms and rules of{" "}
                        <span className="font-semibold text-primary">Zyx Academy</span>
                      </span>
                    }
                    description="By checking this box, you confirm your alignment with our academic honesty standards and enrollment terms."
                    checked={agreed}
                    onCheckedChange={(checked) => {
                      setAgreed(checked);
                      if (errors.agreed) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.agreed;
                          return next;
                        });
                      }
                    }}
                    error={errors.agreed}
                    required
                  />

                  {/* Submit row */}
                  <div className="flex items-center gap-3 pt-3 border-t border-border mt-6">
                    <Button 
                      type="submit" 
                      variant="default"
                      size="lg"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto"
                    >
                      {isSubmitting ? "Registering..." : "Submit Registration"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="lg"
                      onClick={resetForm}
                      disabled={isSubmitting}
                    >
                      Reset
                    </Button>
                  </div>

                </form>
              </div>
            </Reveal>
          </div>

          {/* Right Column: State Viewer & Controls Dashboard */}
          <div className="lg:col-span-5 space-y-6">
            <Reveal>
              <div className="bg-card border border-border shadow-sm rounded-xl p-6">
                <h2 className="font-heading text-h6 font-bold tracking-tight text-foreground border-b border-border pb-4 mb-4">
                  Component Inspector
                </h2>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-body-sm font-semibold text-foreground mb-2">
                      Inspector actions
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleToggleMockErrors}
                        className="w-full flex items-center justify-start text-left"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2 text-status-error" />
                        Trigger validation errors
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resetForm}
                        className="w-full flex items-center justify-start text-left"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reset form state
                      </Button>
                    </div>
                  </div>

                  {/* Live values state block */}
                  <div>
                    <h3 className="text-body-sm font-semibold text-foreground mb-2">
                      Live values (`state`)
                    </h3>
                    <div className="rounded-lg bg-muted p-4 text-[0.8rem] font-mono overflow-auto max-h-64 ds-scrollbar text-muted-foreground select-text">
                      <pre>
                        {JSON.stringify(
                          {
                            fullName,
                            email,
                            password: password ? "********" : "",
                            age,
                            course,
                            files: fileNames,
                            agreed,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>

                  {/* Validation errors block */}
                  <div>
                    <h3 className="text-body-sm font-semibold text-foreground mb-2">
                      Validation errors (`errors`)
                    </h3>
                    <div className={cn(
                      "rounded-lg p-4 text-[0.8rem] font-mono overflow-auto max-h-48 ds-scrollbar transition-colors select-text",
                      Object.keys(errors).length > 0 
                        ? "bg-status-error/5 text-status-error border border-status-error/20" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      <pre>
                        {Object.keys(errors).length > 0 
                          ? JSON.stringify(errors, null, 2) 
                          : "{} // No active errors"}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

        </div>
      </SectionContainer>
    </div>
  );
}
