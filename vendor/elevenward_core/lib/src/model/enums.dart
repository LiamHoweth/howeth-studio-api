/// The eight player attributes visible to the player.
enum PlayerAttribute {
  pace,
  technique,
  passing,
  finishing,
  defending,
  strength,
  stamina,
  composure,
}

/// The four position families supported by Elevenward careers.
enum PositionFamily { striker, winger, midfielder, defender }

/// Position-specific play styles. Each value belongs to exactly one family.
enum Archetype {
  poacher(PositionFamily.striker),
  targetForward(PositionFamily.striker),
  completeForward(PositionFamily.striker),
  touchlineWinger(PositionFamily.winger),
  invertedWinger(PositionFamily.winger),
  wideCreator(PositionFamily.winger),
  playmaker(PositionFamily.midfielder),
  boxToBox(PositionFamily.midfielder),
  ballWinner(PositionFamily.midfielder),
  stopper(PositionFamily.defender),
  ballPlayingCentreBack(PositionFamily.defender),
  attackingFullback(PositionFamily.defender);

  const Archetype(this.positionFamily);

  final PositionFamily positionFamily;
}

/// The physical load selected for the week's training.
enum TrainingIntensity { light, balanced, intensive }

/// How much downside the player accepts during a spotlight situation.
enum SpotlightApproach { safe, balanced, bold }

/// The manager's squad decision for the current match.
enum SelectionStatus { starter, bench, omitted }

/// The result of the player's club match.
enum TeamResult { win, draw, loss }
