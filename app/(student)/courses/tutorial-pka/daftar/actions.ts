"use server";

export interface PkaRegisterState {
  success?: boolean;
  error?: string;
}

export async function registerPkaAction(
  _prev: PkaRegisterState,
  _formData: FormData,
): Promise<PkaRegisterState> {
  return { error: "Mohon maaf, pendaftaran Tutorial PKA saat ini telah ditutup." };
}
