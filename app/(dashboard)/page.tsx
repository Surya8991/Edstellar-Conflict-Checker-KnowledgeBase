import { redirect } from "next/navigation";

/** Root now lands on the Edstellar Database (the Dashboard moved to /dashboard). */
export default function RootPage() {
  redirect("/edstellar-database");
}
