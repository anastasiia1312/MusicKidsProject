export interface TeacherBankDetails {
  teacherId: string;
  alias: string;
  cbuCvu: string;
  accountHolder: string;
  bankName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SaveTeacherBankDetailsPayload {
  alias: string;
  cbuCvu: string;
  accountHolder: string;
  bankName?: string;
}

export interface BankDetailsValidationResult {
  isValid: boolean;
  errorMessage?: string;
  cleanData?: {
    alias: string;
    cbuCvu: string;
    accountHolder: string;
    bankName: string;
  };
}
