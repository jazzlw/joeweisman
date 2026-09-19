import type { Metadata } from "next";
import Link from "next/link";
import { getRecipes } from "@/lib/recipes";

// Counted rather than written down. The hardcoded "Seventy-one" here outlived
// the seventy-one files, and a share preview claiming a number the page
// contradicts is worse than one that doesn't give a number at all.
export function generateMetadata(): Metadata {
  return {
    title: "Recipes",
    description: `${getRecipes().length} recipes from Joe Weisman's own files, kept as he typed them.`,
  };
}

export default function RecipesPage() {
  const recipes = getRecipes();

  return (
    <main className="page" id="main">
      <h1 className="page-title">Recipes</h1>
      <hr className="rule" />

      <div className="prose">
        <p>
          Joe kept his recipes as plain text files, added to and revised over
          about thirty years. There are {recipes.length}  of them here, exactly as
          he typed them &mdash; the annotations, the second thoughts, the notes
          about whose kitchen a dish came from.
        </p>
        <p>
          He filed them by inventing his own extensions. <code>.fud</code> for
          food, <code>.dip</code> for dips, and then whatever seemed right at the
          time: <code>.poorboy</code>, <code>.hummus</code>, <code>.frz</code>.
          The original filename is beside each one, with the year he wrote it.
        </p>
      </div>

      <ol className="recipe-index">
        {recipes.map((r) => (
          <li key={r.slug}>
            <Link href={`/recipes/${r.slug}`}>
              <span className="recipe-index-title">{r.title}</span>
              <span className="recipe-index-file">
                {r.file}
                {r.year && <span className="recipe-year"> &middot; {r.year}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
