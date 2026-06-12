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
