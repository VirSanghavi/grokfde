import { redirect } from "next/navigation";

/** Default book route → public demo company */
export default function BookIndexPage() {
  redirect("/book/grok-fde");
}
