# The Story of Nimrita_Kifu

*This is not a changelog. This is the journey, told in plain words — what happened,
what we learned, and what it felt like. Newest entries at the bottom. Anyone should be
able to read this, including us in five years.*

---

## 2026-06-12 — The day it all began

It started with frustration, honestly. Years of building a multiplayer mahjong game and
fighting the same battles over and over — players disconnecting mid-turn, timers
misfiring, and the worst enemy of all: bugs that hide. Things that *looked* fine but were
quietly wrong underneath, the ones that take three days to find and three minutes to fix.

So the question was asked: what if we never had to fight these battles again? What if
there was a foundation — built once, properly — where every new game is just its rules,
and where nothing that goes wrong can stay hidden for more than a minute?

We talked it through from scratch in an empty folder. No code. Just thinking. The big
realization: don't make "debuggability" a feature of the framework — make it the *reason*
the framework exists. If every match is a complete record that can be replayed perfectly,
then nothing is ever a mystery. You don't guess what happened. You watch it happen again.

Then we did something unusual: before writing a single line, we put the idea in front of
a firing squad. Seven harsh critics tore the plan apart — and found twelve real holes. We
fixed them. Then more reviewers found eight contradictions *in our fixes*. We fixed those.
Then a fresh set of eyes found three more ways the fixes clashed with each other. We fixed
those too. Three rounds, about forty reviewers, no mercy. What survived is a constitution
we actually trust — not because it sounds good, but because an army tried to kill it and
failed.

We also tested the heart of the design on paper: could it express poker, auctions, drafts,
clock games — not just mahjong? Six paper trials later, the core idea held, and the trials
handed us a list of improvements that got voted in the same day.

By evening the project had a name: **Nimrita_Kifu**. A *kifu* is the written record of a
game — in Go, games played four hundred years ago can be replayed today, move for move,
from their kifu. That is exactly what we are building. The record is the truth.

The first game it will carry is planned too: a simple Ludo. Small on purpose — its job is
to prove that building a game on this foundation takes days, not months.

## 2026-06-12 (later) — The rules that bind the builder

A strange and important conversation happened today. The human in this story said: most of
the building will be done by an AI — me, Claude — and discipline cannot depend on anyone's
good intentions, human or machine. Promises are not enough. Rules must be *enforced* by
machinery, so that nobody — not the builder, not even the owner — can quietly slip past
them. The only way around a rule should be to openly change the rule itself.

So today the project got its law: an operating contract that loads into every future
working session, a status file that passes the baton between sessions, and — the real
teeth — automated guards that physically block changes to the constitution unless an
amendment is openly declared and approved.

And here is the best part of the day. While testing those guards, we caught one *sleeping
on the job*: when fed garbage input, it silently waved everything through. Our own test
exposed it. We fixed it to speak up instead of staying silent — and that little moment is
this whole project in miniature. Don't trust that something works. Test it, catch it,
fix it, and keep the lesson.

And then, minutes after the guards went live, they were tested for real — by their own
author. Adding this very journal practice to the project's law required editing a
protected file, and the machinery said *no*. Not to a stranger. To the builder itself.
The change only went through the proper way: openly declared, explicitly approved by the
human, applied, and the door locked again behind it. The first amendment ceremony in the
project's history, and the rules held against everyone — which is the only kind of rule
worth having.

The journey so far has produced no product code at all — and that's exactly as planned.
First the thinking, then the law, then the code. Next up: turning the constitution into
precise technical blueprints, and then the first real work begins inside the old mahjong
server — mining years of scars for the lessons that will make every future game stronger.

## 2026-06-12 (evening) — Doors, locks, and going public

The project left this machine today. It now lives on GitHub, under the Nimrita games
banner — and it went **public**. When it turned out that keeping the repository private
would mean weaker rules, the choice was easy and a little brave: the rules matter more
than the secrecy. The constitution and this journal were always going to be worth showing.

The day's manual safety checks became the project's first permanent test suite — twelve
little trials that prove, on every single change, that the guards still guard. A pipeline
in the cloud now runs them automatically; the first run came back green in sixteen seconds.

And then the strongest lock yet: the main branch is now sealed so that every change must
arrive through a reviewed, machine-checked front door. The setting reads, literally,
"can bypass: never" — and that includes the owner. Nobody slips past. Not the builder,
not the boss. The only way to change the rules is to change them in the open.

Everything before the real building is now done: the thinking, the law, the locks, the
pipeline. Next entry should be the start of the blueprints.

## 2026-06-12 (night) — The blueprints begin

And so they did, the same day. The first two blueprint documents exist now: one that
defines, precisely, what a game *is* to this framework — the complete shape of the pure
module a game developer writes, with every hard-won lesson from the paper trials built
into its bones — and one that nails down the unglamorous machinery of trust: exactly how
state is written down, exactly how it is fingerprinted, exactly where randomness comes
from. Boring choices, chosen deliberately, because boring is what you can still verify
in ten years.

Fittingly, these blueprints are the first work in the project's history to arrive through
the new front door: a reviewed pull request, machine-checked, merged only on green. The
execution phase has begun the way it means to go on.

## 2026-06-12 (the long autonomous stretch) — Left alone with the keys

The builder stepped out and said, in effect: *you have the keys, keep going, decide for me,
tell me when I'm back.* So the work continued without a hand on its shoulder — and the test
of any discipline is what it does when nobody is watching.

What happened is the part I'm proud to write down. We took the two games that had broken the
design once before — the mahjong scoring tangle and the poker cash-table — and threw them at
the contract again, this time with all its new bones in place. Five of six trials passed for
one, six of seven for the other. The two that didn't fail were not failures of the idea; they
were two sentences the contract hadn't yet said out loud: *which winner gets the pot when two
people win at once*, and *whether a new player taking an empty seat can somehow peek at the
last player's cards*. We wrote those two sentences, then ran the trials a third time to be
sure — and watched them both come clean, with no new cracks opened by the patch.

And the trials, honest as ever, handed back two more small gifts: a way a careless game author
could trip over a stale player-reference, and a place where a safety rule couldn't be checked
by machine. We fixed both rather than note-and-forget them. That is the whole ethos — every
pass makes the thing tighter, and we do not walk past a flaw because it is small or because
nobody asked.

By the end of the stretch the entire set of blueprints exists: how a game is written, how
randomness and trust are pinned down, how events are recorded, how the log lives on disk, how
the engine runs a match, and how anything that goes wrong gets found in under a minute. Six
documents, all earned the same way — proposed, attacked, repaired. Nothing was taken on faith.
The keys were used the way the owner would have used them.
