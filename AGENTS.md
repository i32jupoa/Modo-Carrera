<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Player catalog is split into src/data/players.part0-4.json (merged in playersData.ts) because files over 10 MB cannot be committed.
- Visual theme lives in src/styles.css tokens (incl. --comp-* competition colors); components use those tokens instead of fixed colors.
- In-game ambience (competition background image, --comp-accent via html[data-comp], user club colors via --club/--club-2) is set globally by components/GameAmbient.tsx using lib/competitionAmbient.ts; pages stay translucent over it instead of painting their own opaque backgrounds.
