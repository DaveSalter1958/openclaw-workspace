from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

output_path = '/home/davesalter/.openclaw/workspace/dave-profile-summary.pdf'

doc = SimpleDocTemplate(output_path, pagesize=letter,
                        rightMargin=54, leftMargin=54,
                        topMargin=54, bottomMargin=54)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleGuy', parent=styles['Title'], fontSize=22, leading=26, textColor=colors.HexColor('#1f2937'), spaceAfter=16))
styles.add(ParagraphStyle(name='HeadingGuy', parent=styles['Heading1'], fontSize=15, leading=19, textColor=colors.HexColor('#111827'), spaceBefore=10, spaceAfter=8))
styles.add(ParagraphStyle(name='SubGuy', parent=styles['Heading2'], fontSize=12, leading=15, textColor=colors.HexColor('#374151'), spaceBefore=8, spaceAfter=6))
styles.add(ParagraphStyle(name='BodyGuy', parent=styles['BodyText'], fontSize=10.5, leading=14, spaceAfter=6))

story = []

def p(text, style='BodyGuy'):
    story.append(Paragraph(text, styles[style]))

def bullets(items):
    flow = ListFlowable(
        [ListItem(Paragraph(item, styles['BodyGuy'])) for item in items],
        bulletType='bullet', leftIndent=16
    )
    story.append(flow)
    story.append(Spacer(1, 8))

p('Dave Profile and Transition Summary', 'TitleGuy')
p('Prepared by Guy', 'SubGuy')

p('Personal Profile: How to Help Dave Well', 'HeadingGuy')
p('Core transition', 'SubGuy')
p('Dave is moving from a long professional identity built around engineering, credibility, and being needed, toward a more self-directed life with less obligation and more freedom. This is not just retirement planning. It is an identity transition.')

p('What Dave wants', 'SubGuy')
bullets([
    'Freedom', 'Adventure', 'Offroading and overlanding', 'Hiking and camping', 'Painting',
    'Physical projects and making things', 'Peace', 'Usefulness without constant obligation',
    'Time with family in a healthy, non-self-sacrificing way'
])

p('What Dave wants less of', 'SubGuy')
bullets([
    'Feeling forced to work for money', 'Engineering work by obligation', 'Manual business development',
    'Social performance', 'Having to seem smart or engaging for other people’s approval',
    'Wasting life on work and financial worry'
])

p('What energizes Dave', 'SubGuy')
bullets(['Outdoor activity', 'Physical work', 'Building and making things', 'Adventure in nature', 'Movement', 'Practical action'])

p('What drains Dave', 'SubGuy')
bullets(['Social performance', 'Trying to sound smart or interesting', 'Impression management', 'Ongoing financial anxiety', 'Work that feels inauthentic or merely maintenance-driven'])

p('Decision style', 'SubGuy')
bullets(['Direct, practical help', 'Quick decisions', 'A bit of research, then action', 'Structure, but not rigidity', 'Freedom inside a framework'])

p('Emotional reality', 'SubGuy')
p('A major hidden issue is that Dave may feel insecure about how he appears to others, self-conscious, inclined to wear a mask to be liked, and accustomed to earning approval through usefulness and likability. This likely shaped much of his professional life.')

p('Main fear', 'SubGuy')
p('If Dave works less, he fears running out of money, losing the house, having to live somewhere worse, and becoming unsafe or trapped financially. Retirement will not feel good unless it also feels safe.')

p('What a good life looks like', 'SubGuy')
bullets(['Early mornings', 'Gym some days', 'Hiking with Willow', 'One day volunteering, ideally with NatureTrack', 'Golf once or twice', 'Acrylic painting', 'House projects', 'Outdoor/adventure life', 'Some family time, including grandkids'])

p('What matters most', 'SubGuy')
bullets(['Wife', 'Children', 'Supporting them without damaging his own security', 'Helping his wife succeed creatively and financially with sync/music placement'])

p('Best way to help Dave', 'SubGuy')
bullets(['Be direct', 'Be practical', 'Be calm', 'Be strategic', 'Be grounded in reality', 'Be helpful without being fluffy', 'Be organized without becoming bureaucratic'])

p('Avoid', 'SubGuy')
bullets(['Preachiness', 'Vague self-help language', 'Overcomplicated systems', 'Emotionally performative responses', 'Forcing too much routine discipline'])

p('Working principle', 'SubGuy')
p('Dave does not need help inventing what he wants. He needs help making it feel safe, structured, financially credible, and psychologically legitimate.')

story.append(PageBreak())
p('Action Plan: Moving Toward the Life Dave Wants', 'HeadingGuy')

for lane_title, goals, actions, result in [
    ('Lane 1: Financial security so freedom feels real',
     ['Make the retirement transition feel numerically safer', 'Reduce ambiguity around spending and income needs', 'Separate fear of scarcity from actual numbers'],
     ['Build a clear monthly household model around the $17,000/month target', 'Map a 24-month work reduction plan', 'Define the minimum safe annual income', 'Track the house security question directly'],
     'Freedom stops feeling like recklessness.'),
    ('Lane 2: Reduce dependence on Dave’s daily labour',
     ['Increase backlog', 'Keep profitability high', 'Reduce Dave-dependence', 'Automate or delegate business development'],
     ['Automate business development', 'Document recurring expertise', 'Create a not-needed-daily operating model', 'Shift Dave’s role from operator to selective expert'],
     'The business becomes a support structure, not a leash.'),
    ('Lane 3: Design the retirement life now, before retirement arrives',
     ['Make the next life concrete', 'Practice it before full retirement', 'Reduce identity shock'],
     ['Prototype the future week now', 'Protect outdoor and adventure time', 'Build a retirement identity around action, not absence', 'Normalize non-working days'],
     'Retirement becomes a lived rhythm, not an abstract cliff.'),
    ('Lane 4: Support Robbie’s sync and music success',
     ['Increase real opportunities', 'Turn creative work into income', 'Make success more systematic'],
     ['Create a sync pipeline', 'Use AI to reduce admin', 'Track actual business metrics', 'Build visibility without chaos'],
     'Robbie’s creative work has a stronger commercial lane.'),
    ('Lane 5: Reduce performance-based living',
     ['Reduce the need to be liked professionally', 'Reduce the exhausting mask', 'Build a life that feels more authentic and less performative'],
     ['Choose more work and merely accept less', 'Prefer physically grounding activities', 'Reduce socially performative obligations', 'Let usefulness come from real contribution, not impression management'],
     'Life feels more like Dave’s, less like a role.')
]:
    p(lane_title, 'SubGuy')
    p('Goals', 'BodyGuy')
    bullets(goals)
    p('Actions', 'BodyGuy')
    bullets(actions)
    p(f'Result: {result}')

p('Best immediate priorities', 'SubGuy')
bullets([
    'Build a real household financial clarity dashboard',
    'Map a 24-month work reduction plan',
    'Automate business development aggressively',
    'Create a weekly prototype of retirement life',
    'Build a simple sync and music operating pipeline for Robbie'
])

p('Conclusion', 'SubGuy')
p('Dave is not trying to stop being useful. He is trying to stop living as though usefulness must always be purchased through work, likability, and constant effort.')
p('What he wants is a life that is freer, safer, truer, more physical, more adventurous, and more chosen.')
p('The critical bridge is financial clarity, reduced dependence on his daily labour, and permission to live differently.')

doc.build(story)
print(output_path)
