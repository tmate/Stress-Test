# Node.js Project Governance

<!-- TOC -->

- [Collaborators](#collaborators)
  - [Collaborator Activities](#collaborator-activities)
- [Technical Steering Committee](#technical-steering-committee)
  - [TSC Meetings](#tsc-meetings)
- [Collaborator Nominations](#collaborator-nominations)
  - [Onboarding](#onboarding)
- [Consensus Seeking Process](#consensus-seeking-process)

<!-- /TOC -->

## Collaborators

Node.js Core Collaborators maintain the [nodejs/node][] GitHub repository.
The GitHub team for Node.js Core Collaborators is @nodejs/collaborators. Their
privileges include but are not limited to:

* Commit access to the [nodejs/node][] repository
* Access to the Node.js continuous integration (CI) jobs

Both Collaborators and non-Collaborators may propose changes to the Node.js
source code. The mechanism to propose such a change is a GitHub pull request.
Collaborators are responsible for reviewing and merging (_landing_)
pull requests.

At least two Collaborators must approve a pull request before the pull request
can land. (One Collaborator approval is enough if the pull request has been open
for more than 7 days.) Approving a pull request indicates that the Collaborator
accepts responsibility for the change. Approval must be from Collaborators who
are not authors of the change.

If a Collaborator opposes a proposed change, then the change cannot land. The
exception is if the TSC votes to approve the change despite the opposition.
Usually, involving the TSC is unnecessary. Often, discussions or further changes
result in Collaborators removing their opposition.

See:

* [Current list of Collaborators](./README.md#current-project-team-members)
* [A guide for Collaborators](./COLLABORATOR_GUIDE.md)

### Collaborator Activities

Typical activities of a Collaborator include:

* Helping users and novice contributors
* Contributing code and documentation changes that improve the project
* Reviewing and commenting on issues and pull requests
* Participation in working groups
* Merging pull requests

The TSC can remove inactive Collaborators or provide them with _Emeritus_
status. Emeriti may request that the TSC restore them to active status.

## Technical Steering Committee

A subset of the Collaborators forms the Technical Steering Committee (TSC).
The TSC has final authority over this project, including:

* Technical direction
* Project governance and process (including this policy)
* Contribution policy
* GitHub repository hosting
* Conduct guidelines
* Maintaining the list of Collaborators

The current list of TSC members is in
[the project README](./README.md#current-project-team-members).

The [TSC Charter][] governs the operations of the TSC. All changes to the
Charter need approval by the Node.js Board of Directors.

### TSC Meetings

The TSC meets in a voice conference call. Each year, the TSC elects a chair to
run the meetings. The TSC streams its meetings for public viewing on YouTube or
a similar service.

The TSC agenda includes issues that are at an impasse. The intention of the
agenda is not to review or approve all patches. Collaborators review and approve
patches on GitHub.

Any community member can create a GitHub issue asking that the TSC review
something. If consensus-seeking fails for an issue, a Collaborator may apply the
`tsc-agenda` label. That will add it to the TSC meeting agenda.

Before each TSC meeting, the meeting chair will share the agenda with members of
the TSC. TSC members can also add items to the agenda at the beginning of each
meeting. The meeting chair and the TSC cannot veto or remove items.

The TSC may invite people to take part in a non-voting capacity.

During the meeting, the TSC chair ensures that someone takes minutes. After the
meeting, the TSC chair ensures that someone opens a pull request with the
minutes.

The TSC seeks to resolve as many issues as possible outside meetings using
[the TSC issue tracker](https://github.com/nodejs/TSC/issues). The process in
the issue tracker is:

* A TSC member opens an issue explaining the proposal/issue and @-mentions
  @nodejs/tsc.
* The proposal passes if, after 72 hours, there are two or more TSC approvals
  and no TSC opposition.
* If there is an extended impasse, a TSC member may make a motion for a vote.

## Collaborator Nominations

Any existing Collaborator can nominate an individual making significant
and valuable contributions across the Node.js organization to become a new
Collaborator.

To nominate a new Collaborator, open an issue in the [nodejs/node][]
repository, with a summary of the nominee's contributions, for example:

* Commits in the [nodejs/node][] repository.
  * Can be shown using the link
    `https://github.com/nodejs/node/commits?author=${GITHUB_ID}`
    (replace `${GITHUB_ID}` with the nominee's GitHub ID).
* Pull requests and issues opened in the [nodejs/node][] repository.
  * Can be shown using the link
    `https://github.com/nodejs/node/pulls?q=author%3A${GITHUB_ID}+`
* Comments and reviews on issues and pull requests in the
  [nodejs/node][] repository
  * Can be shown using the links
    `https://github.com/nodejs/node/pulls?q=reviewed-by%3A${GITHUB_ID}+`
    and `https://github.com/nodejs/node/pulls?q=commenter%3A${GITHUB_ID}+`
* Assistance provided to end users and novice contributors
* Participation in other projects, teams, and working groups of the
  Node.js organization
  * Can be shown using the links
  `https://github.com/search?q=author%3A${GITHUB_ID}++org%3Anodejs&type=Issues`
    and
`https://github.com/search?q=commenter%3A${GITHUB_ID}++org%3Anodejs&type=Issues`
* Other participation in the wider Node.js community

Mention @nodejs/collaborators in the issue to notify other Collaborators about
the nomination.

If there are no objections raised by any Collaborators one week after
the issue is opened, the nomination will be considered as accepted.
Should there be any objections against the nomination, the TSC is responsible
for working with the individuals involved and finding a resolution.
The nomination must be approved by the TSC, which is assumed when there are no
objections from any TSC members.

Prior to the public nomination, the Collaborator initiating it can seek
feedback from other Collaborators in private using
[the GitHub discussion page][collaborators-discussions] of the
Collaborators team, and work with the nominee to improve the nominee's
contribution profile, in order to make the nomination as frictionless
as possible.

If individuals making valuable contributions do not believe they have been
considered for a nomination, they may log an issue or contact a Collaborator
directly.

### Onboarding

When the nomination is accepted, the new Collaborator will be onboarded
by a TSC member. See [the onboarding guide](./doc/onboarding.md) on
details of the onboarding process. In general, the onboarding should be
completed within a month after the nomination is accepted.

## Consensus Seeking Process

The TSC follows a [Consensus Seeking][] decision-making model as described by
the [TSC Charter][].

[collaborators-discussions]: https://github.com/orgs/nodejs/teams/collaborators/discussions
[Consensus Seeking]: https://en.wikipedia.org/wiki/Consensus-seeking_decision-making
[TSC Charter]: https://github.com/nodejs/TSC/blob/master/TSC-Charter.md
[nodejs/node]: https://github.com/nodejs/node
