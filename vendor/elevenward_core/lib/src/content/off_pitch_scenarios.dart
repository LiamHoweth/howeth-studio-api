import 'content_models.dart';

/// One hundred authored decisions away from the pitch.
///
/// Every scenario is tied to one of the twelve combinations created by three
/// prior-match performance bands and the high-stakes state of the prior and
/// next fixtures.
List<CareerEventDefinition> buildOffPitchScenarios() {
  final categoryCounts = <CareerEventCategory, int>{};
  final events = <CareerEventDefinition>[];
  for (var index = 0; index < _scenarios.length; index++) {
    final scenario = _scenarios[index];
    final number = categoryCounts.update(
      scenario.category,
      (value) => value + 1,
      ifAbsent: () => 1,
    );
    final performance = PreviousMatchPerformance
        .values[index % PreviousMatchPerformance.values.length];
    final previousHighStakes = (index ~/ 3).isOdd;
    final nextHighStakes = (index ~/ 6).isOdd;
    events.add(
      CareerEventDefinition(
        id: 'career-${scenario.category.name}-${number.toString().padLeft(2, '0')}',
        category: scenario.category,
        title: _localized(scenario.title),
        body: _localized(
          '${_contextLead(performance, previousHighStakes, nextHighStakes)} '
          '${scenario.body}',
        ),
        choices: List.generate(
          scenario.actions.length,
          (choiceIndex) => _choice(scenario, choiceIndex),
          growable: false,
        ),
        previousPerformances: {performance},
        previousGameWasHighStakes: previousHighStakes,
        nextGameIsHighStakes: nextHighStakes,
      ),
    );
  }
  return List.unmodifiable(events);
}

EventChoiceDefinition _choice(_Scenario scenario, int index) {
  final wellness = scenario.category == CareerEventCategory.wellness
      ? const [4, 2, 1, -3]
      : const [-2, 0, 2, 1];
  final trust = switch (index) {
    0 => scenario.category == CareerEventCategory.manager ? 3 : 2,
    1 => 1,
    2 => 0,
    _ => -2,
  };
  final money = scenario.category == CareerEventCategory.sponsor
      ? switch (index) {
          0 => scenario.money,
          1 => scenario.money ~/ 2,
          _ => 0,
        }
      : 0;
  return EventChoiceDefinition(
    id: const ['commit', 'compromise', 'protect', 'decline'][index],
    label: _localized(scenario.actions[index]),
    trustDelta: trust,
    reputationDelta: const [2, 1, 0, -1][index],
    moneyDelta: money,
    wellnessDelta: wellness[index],
  );
}

String _contextLead(
  PreviousMatchPerformance performance,
  bool previousHighStakes,
  bool nextHighStakes,
) {
  final display = switch (performance) {
    PreviousMatchPerformance.poor => 'You are coming off a difficult display',
    PreviousMatchPerformance.steady => 'You delivered a steady display',
    PreviousMatchPerformance.standout =>
      'You are coming off a standout display',
  };
  final previous = previousHighStakes
      ? 'in a match that carried real consequences.'
      : 'in a lower-pressure fixture.';
  final next = nextHighStakes
      ? 'Another high-stakes match is next.'
      : 'The next fixture carries less pressure.';
  return '$display $previous $next';
}

LocalizedText _localized(String value) => LocalizedText({
      for (final locale in supportedLocales) locale: value,
    });

final class _Scenario {
  const _Scenario(
    this.category,
    this.title,
    this.body,
    this.actions, {
    this.money = 0,
  });

  final CareerEventCategory category;
  final String title;
  final String body;
  final List<String> actions;
  final int money;
}

const _scenarios = <_Scenario>[
  _Scenario(
    CareerEventCategory.manager,
    'The extra film session',
    'The manager wants you to lead an evening review of the mistakes that shaped the last match.',
    [
      'Run the full review',
      'Attend for the key clips',
      'Send private notes instead',
      'Say recovery must come first'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'A change of position',
    'The staff asks you to learn an unfamiliar role before the upcoming team selection.',
    [
      'Embrace the new role',
      'Trial it for one half',
      'Ask to revisit it after the next match',
      'Refuse the switch'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'The captaincy test',
    'The manager offers you the armband for a tense team meeting, but expects you to challenge close friends.',
    [
      'Lead the room honestly',
      'Share the message with a senior player',
      'Speak to teammates privately',
      'Turn down the armband'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'Training through the warning',
    'The manager suggests one more hard session even though the performance staff recommends a lighter load.',
    [
      'Follow the manager’s plan',
      'Train hard for only thirty minutes',
      'Choose the recovery program',
      'Ask the union representative to intervene'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'The prospect in your place',
    'A young player has impressed in your position and the manager asks you to mentor them before selection.',
    [
      'Mentor them without conditions',
      'Help after your own preparation',
      'Share a short set of notes',
      'Keep your methods private'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'Private criticism goes public',
    'A confidential correction from the manager has leaked, and reporters are waiting outside the training ground.',
    [
      'Defend the manager publicly',
      'Give a neutral team-first answer',
      'Say nothing until after the next match',
      'Challenge the manager in public'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'First in the penalty queue',
    'The staff asks whether you will take the first penalty if the next match reaches a shootout.',
    [
      'Volunteer for the first kick',
      'Take one later in the order',
      'Offer to be the emergency taker',
      'Remove yourself from the list'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'The curfew exception',
    'A club event runs past the team curfew and the manager quietly lets you decide when to leave.',
    [
      'Leave before curfew',
      'Make a brief appearance then go',
      'Join remotely from home',
      'Stay until the event ends'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'A promise of minutes',
    'The manager hints at a start if you accept an intense individual session with the assistant coach.',
    [
      'Take the full session',
      'Negotiate a shorter technical session',
      'Trust normal preparation',
      'Reject conditional promises'
    ],
  ),
  _Scenario(
    CareerEventCategory.manager,
    'The tactical disagreement',
    'You spot a flaw in the next match plan, but raising it could be read as questioning the staff.',
    [
      'Present a detailed alternative',
      'Ask one careful question',
      'Tell the captain privately',
      'Keep the concern to yourself'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The rookie needs a lift',
    'A new academy player has no transport home after a late recovery session.',
    [
      'Drive them home yourself',
      'Arrange a shared club car',
      'Pay for a reliable ride',
      'Leave it to the club'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The celebration invitation',
    'A teammate plans a late birthday gathering on the only free evening before the next fixture.',
    [
      'Stay for the whole celebration',
      'Appear for one hour',
      'Send a gift and video message',
      'Decline without replying'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'Covering for the veteran',
    'A senior player asks you to hide that they arrived late to the team meeting.',
    [
      'Protect them and handle it privately',
      'Urge them to tell the captain',
      'Refuse but keep quiet',
      'Report it immediately'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The hospital visit',
    'An injured teammate asks for company during a specialist appointment that overlaps with optional training.',
    [
      'Go to the full appointment',
      'Visit after your session',
      'Arrange a group video call',
      'Explain that you cannot help'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'A message escapes the group chat',
    'A frustrated comment about the tactics has been screenshotted and traced to the players’ chat.',
    [
      'Take responsibility for the group',
      'Help write a joint apology',
      'Delete your messages and stay quiet',
      'Identify the original sender'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The boot-room argument',
    'Two teammates ask you to settle an argument that has divided the dressing room.',
    [
      'Mediate the dispute tonight',
      'Bring in the captain',
      'Speak to each player separately',
      'Stay out of their conflict'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The players’ meeting',
    'The squad wants an honest meeting about bonuses and workload before the next match.',
    [
      'Speak for the whole squad',
      'Attend and support the captain',
      'Submit your concerns in writing',
      'Skip the meeting'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'Helping the new signing settle',
    'A new arrival is isolated by the language barrier and asks to spend the day with you.',
    [
      'Host them for the day',
      'Invite them to the team meal',
      'Connect them with club support',
      'Say your schedule is full'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'The disputed free kick',
    'A teammate insists the next dangerous free kick should be theirs despite the coach naming you.',
    [
      'Share the responsibility by situation',
      'Settle it with a training contest',
      'Keep the assigned duty',
      'Confront them in front of the squad'
    ],
  ),
  _Scenario(
    CareerEventCategory.teammate,
    'A loan request from the squad',
    'A fringe player quietly asks you for money to solve an urgent family problem.',
    [
      'Give the full amount privately',
      'Offer a smaller no-interest loan',
      'Connect them with player welfare',
      'Refuse and tell the captain'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'The transfer leak',
    'Your agent can leak interest from another club to strengthen your position, but the story may disrupt preparation.',
    [
      'Authorize the full story',
      'Allow a vague report with no club named',
      'Wait until after the next fixture',
      'Forbid all contact with reporters'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'A meeting in another country',
    'A recruitment director offers a private dinner abroad on your recovery day.',
    [
      'Fly out for the meeting',
      'Join by secure video',
      'Send your agent alone',
      'Decline the approach'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'Commission on the table',
    'Your agent wants a larger percentage in exchange for expanding their international network.',
    [
      'Accept the full commission increase',
      'Offer a performance-based increase',
      'Delay terms until the offseason',
      'Begin looking for new representation'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'The public ultimatum',
    'Your representative suggests saying you need more minutes or will consider leaving.',
    [
      'Issue the ultimatum',
      'Express ambition without a threat',
      'Ask for a private club meeting',
      'Reject the tactic completely'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'A documentary crew',
    'A streaming producer wants access to your home and training routine for the rest of the season.',
    [
      'Grant full access',
      'Allow matchday-only filming',
      'Record your own controlled footage',
      'Turn down the series'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'The wage comparison',
    'Your agent has confidential salary figures and wants you to use them in talks with the club.',
    [
      'Use every figure in negotiation',
      'Reference the market without names',
      'Keep the information for later',
      'Delete the leaked document'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'The scouting dinner',
    'Your agent invites scouts to a dinner where you would be expected to discuss life beyond your current club.',
    [
      'Attend and answer openly',
      'Make a short appearance',
      'Let the agent present your case',
      'Cancel the dinner'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'Control of your accounts',
    'Your representative offers to run every social account so your public message stays disciplined.',
    [
      'Hand over full control',
      'Approve posts before they go live',
      'Use them only during busy weeks',
      'Keep all accounts personal'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'The release-clause rumor',
    'Your agent believes inventing a low release clause will attract calls from bigger clubs.',
    [
      'Let the rumor circulate',
      'Hint only that terms are flexible',
      'Correct the record quietly',
      'Publicly dismiss the agent’s idea'
    ],
  ),
  _Scenario(
    CareerEventCategory.agent,
    'A second representative',
    'A specialist proposes joining your team for commercial deals while your main agent handles football.',
    [
      'Add the specialist now',
      'Run a three-month trial',
      'Wait until the offseason',
      'Stay with one representative'
    ],
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The midnight campaign shoot',
    'A sportswear brand will pay well for a shoot that runs deep into the night.',
    [
      'Complete the full night shoot',
      'Shoot a shorter studio segment',
      'Offer daytime training-ground content',
      'Reject the campaign'
    ],
    money: 1800,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'Posting after a painful result',
    'A sponsor requires a cheerful product post while supporters are still reacting to the match.',
    [
      'Publish the planned post now',
      'Rewrite it with a respectful message',
      'Delay it until tomorrow',
      'Refuse the post'
    ],
    money: 1200,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The untested recovery device',
    'A technology brand wants you to praise a recovery device the club doctors have not approved.',
    [
      'Demonstrate it in the campaign',
      'Promote only its non-medical features',
      'Request independent testing first',
      'Walk away from the deal'
    ],
    money: 2200,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'Boots in rival colors',
    'A limited-edition boot uses colors closely associated with your club’s biggest rival.',
    [
      'Wear them in the next match',
      'Use a neutral custom version',
      'Model them away from matchday',
      'Reject the colorway'
    ],
    money: 1600,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The exclusivity clause',
    'A drinks company offers a large fee but wants control over every bottle seen near you.',
    [
      'Accept full exclusivity',
      'Limit exclusivity to public events',
      'Offer one campaign with no long contract',
      'Decline the restriction'
    ],
    money: 2400,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'Family in the advert',
    'A brand wants your relatives on camera to make its campaign feel personal.',
    [
      'Bring the whole family into the advert',
      'Include one willing relative',
      'Use childhood photos with permission',
      'Keep family life private'
    ],
    money: 2000,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The matchday activation',
    'A sponsor wants an appearance in the stadium concourse shortly before team preparation begins.',
    [
      'Attend the full activation',
      'Make a five-minute appearance',
      'Record a welcome video earlier',
      'Protect the pre-match routine'
    ],
    money: 1500,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'A promise of guaranteed goals',
    'A campaign script asks you to guarantee a goal in the next fixture.',
    [
      'Read the guarantee as written',
      'Change it to a promise of effort',
      'Film without mentioning the match',
      'Reject the script'
    ],
    money: 1700,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The signature product launch',
    'A brand can fast-track a product carrying your name if you surrender design approval.',
    [
      'Sign away approval for the fast launch',
      'Keep approval over the final design',
      'Release a small test edition',
      'Pause the product'
    ],
    money: 2600,
  ),
  _Scenario(
    CareerEventCategory.sponsor,
    'The competitor’s gift',
    'An unsigned package from a competing brand appears online before your current deal is settled.',
    [
      'Wear the gift publicly',
      'Thank them without showing the product',
      'Return it through your agent',
      'Report the approach to your current sponsor'
    ],
    money: 1300,
  ),
  _Scenario(
    CareerEventCategory.press,
    'The tunnel microphone',
    'A broadcaster wants your immediate reaction before emotions from the match have settled.',
    [
      'Give a candid live interview',
      'Offer one controlled answer',
      'Ask to speak after cooling down',
      'Walk past the microphone'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'Who owns the mistake',
    'A reporter asks whether a teammate caused the decisive moment.',
    [
      'Take responsibility for the team',
      'Explain the play without naming anyone',
      'Say the review is private',
      'Point out the teammate’s error'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'The tactical question',
    'The press asks if the manager’s system left you exposed.',
    [
      'Defend the plan in detail',
      'Say the squad adapts together',
      'Defer all tactics to the manager',
      'Say the system failed'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'The referee controversy',
    'A disputed decision dominates the coverage and one forceful quote could shape the week.',
    [
      'Call for accountability',
      'Request a calm official review',
      'Focus only on your own performance',
      'Accuse the referee of bias'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'Supporters turn on the team',
    'A radio host asks whether angry supporters have gone too far.',
    [
      'Acknowledge their frustration',
      'Ask for patience before the next match',
      'Avoid discussing supporters',
      'Tell critics to stay home'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'The transfer question returns',
    'Every outlet wants to know if the next fixture could be your last for the club.',
    [
      'Commit your future publicly',
      'Say decisions wait until the offseason',
      'Give a team-only answer',
      'Encourage the speculation'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'A national-team comparison',
    'You are asked to rank yourself against a player competing for the same international role.',
    [
      'Back yourself as the better player',
      'Praise both skill sets',
      'Decline to compare teammates',
      'Question the rival’s recent form'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'The old post resurfaces',
    'An immature message from years ago is spreading just as match coverage intensifies.',
    [
      'Apologize without qualifications',
      'Explain and apologize in an interview',
      'Remove it and post a short statement',
      'Claim it has been misread'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'The ratings debate',
    'A popular outlet gave you the lowest score on the team and asks you to react on camera.',
    [
      'Discuss what you must improve',
      'Question the score respectfully',
      'Ignore individual ratings',
      'Mock the outlet’s analysis'
    ],
  ),
  _Scenario(
    CareerEventCategory.press,
    'Access before the big week',
    'A respected journalist requests a long interview during your main recovery window.',
    [
      'Give the full interview',
      'Offer twenty focused minutes',
      'Answer questions by email',
      'Decline until the season ends'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'The graduation you promised',
    'A sibling’s graduation falls on the evening before mandatory team travel.',
    [
      'Ask the club to travel separately',
      'Attend only the ceremony',
      'Join the celebration by video',
      'Miss it for the team schedule'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'Parents at the training ground',
    'Your parents arrive unexpectedly and hope to spend the entire day with you.',
    [
      'Reshape the day around their visit',
      'Meet them after recovery',
      'Arrange a brief club tour',
      'Ask them to return another week'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'Money needed at home',
    'A relative asks for a large emergency payment and wants the matter kept from everyone else.',
    [
      'Send the full amount immediately',
      'Pay the urgent bill directly',
      'Offer help through a financial adviser',
      'Refuse the request'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'The call you keep missing',
    'Someone close to you needs a serious conversation during the team’s quiet recovery night.',
    [
      'Make time for the full conversation',
      'Set a clear thirty-minute call',
      'Ask another relative to check in first',
      'Switch off the phone'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'Childcare falls through',
    'A childcare emergency collides with a voluntary tactical session.',
    [
      'Stay home and handle it',
      'Split the day with your partner',
      'Arrange trusted emergency care',
      'Ask family to solve it without you'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'The hometown emergency',
    'Severe weather has damaged the family home while your club schedule tightens.',
    [
      'Travel home to help in person',
      'Coordinate repairs remotely',
      'Send funds and a trusted friend',
      'Wait until the schedule clears'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'A partner wants one quiet day',
    'Your partner asks for a phone-free day together before another demanding week.',
    [
      'Protect the entire day',
      'Keep half the day free',
      'Plan dinner after preparation',
      'Say football must take every hour'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'The question of moving',
    'Your family wants to move closer to the training ground, but you are unsure how long you will stay.',
    [
      'Commit to the move now',
      'Rent nearby for one season',
      'Wait until contract talks finish',
      'Keep the current home'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'Tickets for everyone',
    'Relatives request more match tickets than your club allocation can cover.',
    [
      'Buy every extra ticket yourself',
      'Invite only immediate family',
      'Arrange a shared viewing event',
      'Tell everyone not to come'
    ],
  ),
  _Scenario(
    CareerEventCategory.family,
    'The holiday gathering',
    'A long-planned family gathering overlaps with the opening of your recovery block.',
    [
      'Attend the full gathering',
      'Leave after the family meal',
      'Host a shorter gathering locally',
      'Cancel at the last moment'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'The party photo',
    'A harmless late-night photo is spreading without the timestamp that proves it was taken on a day off.',
    [
      'Post the full timeline and context',
      'Issue a short factual correction',
      'Let the club handle questions',
      'Attack everyone sharing it'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'The leaked training clip',
    'A clip of you losing your temper in training has gone viral without showing what happened before it.',
    [
      'Own the reaction publicly',
      'Apologize to the squad first',
      'Ask the club to remove the clip',
      'Insist you did nothing wrong'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'A fan encounter goes viral',
    'A brief conversation with a young supporter is drawing unexpected public attention.',
    [
      'Invite the supporter back as your guest',
      'Send a private thank-you',
      'Use the moment to promote a cause',
      'Distance yourself from the attention'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'The live gaming stream',
    'A popular creator invites you to a long live stream the night before team reporting.',
    [
      'Join the full live show',
      'Play one short segment',
      'Record a clip earlier in the day',
      'Decline without explanation'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'Front row at fashion week',
    'A designer offers a visible front-row seat that requires same-day travel.',
    [
      'Attend and embrace the cameras',
      'Appear briefly then return',
      'Loan an outfit for a remote post',
      'Turn down the invitation'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'Seen outside the nightclub',
    'A photographer has images of you outside a club, although you left before the night began.',
    [
      'Explain the full evening publicly',
      'Confirm only when you left',
      'Ask the club to respond',
      'Threaten the photographer'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'The influencer collaboration',
    'A creator with a huge audience and a history of controversy wants a joint video.',
    [
      'Film the uncensored collaboration',
      'Set strict topics in advance',
      'Offer a football-only remote segment',
      'Reject any association'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'Credit for an anonymous gift',
    'A charity has revealed that you funded equipment despite your request to remain anonymous.',
    [
      'Use the attention to raise more money',
      'Thank them and redirect all credit',
      'Ask them to remove your name',
      'Withdraw future support'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'A chant with your name',
    'Supporters have created a song about you that includes a line insulting a rival player.',
    [
      'Join the clean parts with supporters',
      'Ask fans to change the line',
      'Ignore the chant entirely',
      'Repeat the insulting line online'
    ],
  ),
  _Scenario(
    CareerEventCategory.reputation,
    'The awards shortlist',
    'You are invited to an awards ceremony during a week when the team wants total focus.',
    [
      'Attend and accept the spotlight',
      'Stay only for your category',
      'Send a recorded message',
      'Reject the nomination publicly'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'The precautionary scan',
    'A small pain can be scanned today, but the appointment would replace the main team session.',
    [
      'Book the full scan and assessment',
      'Scan first and join training late',
      'Monitor it with the physio',
      'Hide the pain and train'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'Sleep will not come',
    'Several poor nights have left you foggy and the club offers specialist sleep support.',
    [
      'Begin the complete sleep program',
      'Take a short consultation',
      'Change your routine independently',
      'Use stimulants and push through'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'The nutrition reset',
    'The nutritionist recommends a strict new plan that will disrupt meals with family and teammates.',
    [
      'Adopt the complete plan',
      'Change only matchweek meals',
      'Test it after the next fixture',
      'Keep eating as before'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'One more physio session',
    'The medical team offers an extra evening treatment during your only free social window.',
    [
      'Take the full treatment',
      'Book a shorter recovery session',
      'Use the home recovery plan',
      'Skip treatment entirely'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'Mental fatigue shows',
    'The club psychologist notices that decisions feel slower and offers a confidential appointment.',
    [
      'Start regular confidential sessions',
      'Take one assessment',
      'Ask for a quiet day first',
      'Reject the concern'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'The red-eye invitation',
    'Friends invite you on an overnight trip that returns hours before club recovery begins.',
    [
      'Decline and protect your sleep',
      'Join only the daytime portion',
      'Meet them locally instead',
      'Take the overnight flight'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'A cold on matchweek',
    'Early illness symptoms appear and the doctor asks for an honest account before the squad gathers.',
    [
      'Report every symptom and isolate',
      'Attend a private medical check',
      'Train alone and monitor it',
      'Hide the symptoms'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'The blister that changes everything',
    'New boots have torn the skin on your foot, but switching pairs could upset an equipment partner.',
    [
      'Use the medically approved pair',
      'Modify the sponsored boots',
      'Rest the foot until the final session',
      'Play through the damage'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'Too much caffeine',
    'Performance staff flag your stimulant use and recommend removing it before the next fixture.',
    [
      'Follow the full reduction plan',
      'Cut the dose in half',
      'Replace it with a sleep-first routine',
      'Ignore the data'
    ],
  ),
  _Scenario(
    CareerEventCategory.wellness,
    'The recovery room closes',
    'A maintenance issue removes the squad’s usual recovery facilities and everyone must choose an alternative.',
    [
      'Book the club-approved facility',
      'Share a basic recovery space',
      'Follow a careful home routine',
      'Skip recovery this week'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'The school assembly',
    'A local school asks you to answer questions during the morning normally reserved for recovery.',
    [
      'Spend the morning with the students',
      'Make a short surprise visit',
      'Join the assembly by video',
      'Decline the invitation'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'The food-bank shift',
    'Supporters are organizing an urgent food-bank drive and ask you to work beside them.',
    [
      'Work the full public shift',
      'Help for one hour',
      'Fund and record a message',
      'Keep the week private'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'A clinic on the old pitch',
    'Your childhood club wants you to lead a training clinic for players who know every result you produce.',
    [
      'Lead the complete clinic',
      'Coach one small group',
      'Send your training plan and equipment',
      'Say the timing does not work'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'The children’s ward visit',
    'A hospital can host the squad only during your individual video-analysis session.',
    [
      'Join the full ward visit',
      'Visit after the analysis session',
      'Make personal video calls',
      'Leave the visit to teammates'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'Saving the grassroots pitch',
    'A neighborhood pitch needs immediate repairs and organizers want your money and your name.',
    [
      'Fund the full repair publicly',
      'Match donations up to a limit',
      'Donate privately',
      'Decline the campaign'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'A supporter’s memorial',
    'The family of a lifelong supporter asks you to speak at a memorial on the team’s travel day.',
    [
      'Arrange separate travel and speak',
      'Attend the opening only',
      'Record a personal tribute',
      'Send a club representative'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'Welcome through football',
    'A refugee support group asks you to launch its first weekly football session.',
    [
      'Launch and coach the session',
      'Open the event then leave',
      'Fund qualified local coaches',
      'Turn down involvement'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'The river cleanup',
    'A club environmental campaign wants photographs of players doing physical cleanup work.',
    [
      'Join the full cleanup',
      'Attend the launch safely',
      'Fund protective equipment',
      'Avoid the campaign'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'Supporting the women’s team',
    'The club’s women’s side has a major home fixture and asks you to promote and attend it.',
    [
      'Attend and promote the full match',
      'Appear before kickoff',
      'Record a tactical preview',
      'Say nothing publicly'
    ],
  ),
  _Scenario(
    CareerEventCategory.community,
    'A foundation in your name',
    'Local leaders offer to build a long-term youth program around your profile.',
    [
      'Launch the full foundation',
      'Start with one pilot program',
      'Support an existing charity instead',
      'Decline use of your name'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The appearance-bonus trade',
    'The club offers a lower base wage in exchange for a much larger bonus whenever you play.',
    [
      'Accept the performance-heavy terms',
      'Ask for a balanced wage and bonus',
      'Keep the current structure',
      'End the discussion'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The promised-role clause',
    'A new offer includes a verbal promise of starts but the club refuses to put the role in writing.',
    [
      'Trust the verbal promise',
      'Demand a written role review',
      'Accept without any minutes promise',
      'Reject the offer'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The release-clause number',
    'The club wants a release clause high enough to discourage nearly every future buyer.',
    [
      'Accept the club’s number',
      'Negotiate a realistic midpoint',
      'Ask for no clause at all',
      'Pause all contract talks'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'Who owns your image',
    'The proposed deal gives the club broad rights to use your name in commercial campaigns.',
    [
      'Grant the full image rights',
      'Limit rights to club partners',
      'License each campaign separately',
      'Remove image rights from the deal'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'Talks before the decisive run',
    'The club wants to settle your future now even though negotiations could dominate an important stretch.',
    [
      'Finish the deal this week',
      'Set a strict one-hour deadline',
      'Postpone talks until the schedule eases',
      'Withdraw from negotiations'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The loyalty payment',
    'A large loyalty bonus requires you to waive part of the signing payment you would receive now.',
    [
      'Choose the long-term loyalty bonus',
      'Split the value evenly',
      'Take the immediate payment',
      'Reject both structures'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The representative’s fee',
    'The club will complete the deal only if your agent’s fee comes from your own signing bonus.',
    [
      'Pay the full fee from the bonus',
      'Split the fee with the agent',
      'Ask the agent to waive part of it',
      'Let the deal collapse'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'The optional final year',
    'The club alone would control an extra season at the same wage after the main contract ends.',
    [
      'Accept the club option',
      'Make the option mutual',
      'Replace it with a performance trigger',
      'Remove the extra year'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'Targets in the small print',
    'Lucrative bonuses depend on appearance and scoring targets that may be outside your control.',
    [
      'Back yourself to hit every target',
      'Lower both targets and bonuses',
      'Use team achievements instead',
      'Refuse target-based pay'
    ],
  ),
  _Scenario(
    CareerEventCategory.contract,
    'Captaincy as a promise',
    'The contract offer mentions a future leadership role that the current captain knows nothing about.',
    [
      'Accept the private captaincy promise',
      'Ask for a transparent leadership review',
      'Remove captaincy from negotiations',
      'Reveal the promise to the squad'
    ],
  ),
];
