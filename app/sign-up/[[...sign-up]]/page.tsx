import { SignUp } from "@clerk/nextjs";
import { Mark } from "@/components/mark";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <Mark />
          <p className="font-serif text-3xl">LendLoop</p>
        </div>
        <SignUp
          appearance={{
            variables: {
              colorPrimary: "#1c6b4a",
              colorBackground: "#fffdf8",
              borderRadius: "0.9rem",
            },
          }}
        />
      </div>
    </main>
  );
}
