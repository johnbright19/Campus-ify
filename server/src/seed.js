import 'dotenv/config'
import { db } from './supabase.js'

const SEED_RESOURCES = [
  {
    name: 'Seminar Hall A',
    type: 'seminar_hall',
    location: 'Main Academic Block, 2nd Floor',
    capacity: 120,
    features: ['projector', 'mic', 'ac', 'audio', 'dais'],
    requires_approval: true,
    approver_role: 'hod',
    owner_department: 'Computer Science',
    is_active: true
  },
  {
    name: 'Seminar Hall B',
    type: 'seminar_hall',
    location: 'Science & Humanities Block, 1st Floor',
    capacity: 80,
    features: ['projector', 'ac', 'whiteboard', 'mic'],
    requires_approval: true,
    approver_role: 'hod',
    owner_department: 'Electronics & Comm',
    is_active: true
  },
  {
    name: 'Campus Sports TURF',
    type: 'ground',
    location: 'South Campus Sports Arena',
    capacity: 200,
    features: ['floodlights', 'artificial_turf', 'goalposts', 'scoreboard', 'seating'],
    requires_approval: true,
    approver_role: 'admin',
    owner_department: 'Physical Education & Sports',
    is_active: true
  },
  {
    name: 'ATL Lab (Atal Tinkering Lab)',
    type: 'lab',
    location: 'Innovation Center, Ground Floor',
    capacity: 40,
    features: ['3d_printer', 'iot_kits', 'soldering_stations', 'oscilloscopes', 'ac', 'projector'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Innovation & Robotics Club',
    is_active: true
  },
  {
    name: 'DB Lab (Database Systems Lab)',
    type: 'lab',
    location: 'IT Wing, 3rd Floor, Room 304',
    capacity: 60,
    features: ['dbms_servers', 'ac', 'lan', 'whiteboard', 'projector'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Computer Science',
    is_active: true
  },
  {
    name: 'IP Lab (Image Processing & Vision Lab)',
    type: 'lab',
    location: 'IT Wing, 3rd Floor, Room 308',
    capacity: 50,
    features: ['gpu_workstations', 'cameras', 'opencv_suite', 'ac', 'projector'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Computer Science',
    is_active: true
  },
  {
    name: 'WDL Lab (Web Development Lab)',
    type: 'lab',
    location: 'IT Wing, 2nd Floor, Room 205',
    capacity: 60,
    features: ['fullstack_dev_environments', 'ac', 'lan', 'whiteboard'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Information Technology',
    is_active: true
  },
  {
    name: 'CC Lab (Central Computing & Cloud Lab)',
    type: 'lab',
    location: 'Central Library Building, 1st Floor',
    capacity: 100,
    features: ['cloud_terminals', 'high_speed_lan', 'placement_exam_setup', 'ac', 'audio'],
    requires_approval: true,
    approver_role: 'hod',
    owner_department: 'Central IT Services',
    is_active: true
  },
  {
    name: 'Grand Campus Auditorium',
    type: 'auditorium',
    location: 'Central University Plaza',
    capacity: 600,
    features: ['stage_lighting', 'line_array_audio', 'green_rooms', 'projector', 'central_ac'],
    requires_approval: true,
    approver_role: 'admin',
    owner_department: 'Campus Administration',
    is_active: true
  },
  {
    name: 'Mobile AV & 4K Projector Kit',
    type: 'equipment',
    location: 'IT Helpdesk Depot',
    capacity: 0,
    features: ['4k_projector', 'wireless_mics', 'hdmi_switch', 'tripod_screen'],
    requires_approval: false,
    approver_role: 'faculty',
    owner_department: 'IT Support Services',
    is_active: true
  },
  {
    name: 'JBL Sound System & Mics',
    type: 'equipment',
    location: 'Student Council Room',
    capacity: 0,
    features: ['amplifier', 'wireless_mics', 'surround_speakers', 'mixer'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Student Council',
    is_active: true
  },
  {
    name: 'Portable Bluetooth Speakers',
    type: 'equipment',
    location: 'IT Helpdesk Depot',
    capacity: 0,
    features: ['bluetooth', 'rechargeable', 'high_bass'],
    requires_approval: false,
    approver_role: 'faculty',
    owner_department: 'IT Support Services',
    is_active: true
  },
  {
    name: 'Event Benches (Set of 50)',
    type: 'equipment',
    location: 'Campus Storage Unit',
    capacity: 0,
    features: ['wooden_benches', 'seating'],
    requires_approval: true,
    approver_role: 'admin',
    owner_department: 'Campus Administration',
    is_active: true
  },
  {
    name: 'Sense Board (Smart Interactive Board)',
    type: 'equipment',
    location: 'Innovation Center',
    capacity: 0,
    features: ['touch_screen', 'smart_stylus', 'wifi', 'android_os'],
    requires_approval: true,
    approver_role: 'faculty',
    owner_department: 'Computer Science',
    is_active: true
  }
]

async function seed() {
  console.log('🌱 Seeding specific campus facilities and demo roles...')

  // Insert or upsert resources
  for (const res of SEED_RESOURCES) {
    const { data: existing } = await db.from('resources').select('id').eq('name', res.name).limit(1)

    if (!existing || existing.length === 0) {
      const { data, error } = await db.from('resources').insert(res).select().single()
      if (error) {
        console.error(`Error inserting ${res.name}:`, error.message)
      } else {
        console.log(`✓ Added facility: ${data.name} (${data.type})`)
      }
    } else {
      // Update existing record with refreshed features and location
      await db.from('resources').update(res).eq('id', existing[0].id)
      console.log(`✓ Updated facility: ${res.name}`)
    }
  }

  // Insert or update demo users
  const demoUsers = [
    { email: 'student.demo@campus.edu', role: 'student', full_name: 'Alex Student', club: 'IEEE' },
    { email: 'council.head@campus.edu', role: 'student', full_name: 'Council Head', club: 'Student Council' },
    { email: 'csi.lead@campus.edu', role: 'student', full_name: 'CSI Lead', club: 'XIE-CSI Committee' },
    { email: 'tedx.org@campus.edu', role: 'student', full_name: 'TedX Organizer', club: 'TedX-XIE' },
    { email: 'wdc.lead@campus.edu', role: 'student', full_name: 'WDC Lead', club: 'Women Development Cell' },
    { email: 'alumni.rep@campus.edu', role: 'student', full_name: 'Alumni Rep', club: 'Alumni Cell' },
    { email: 'faculty.demo@campus.edu', role: 'faculty', full_name: 'Dr. Sarah Faculty (Lab In-Charge)', department: 'Computer Science' },
    { email: 'hod.demo@campus.edu', role: 'hod', full_name: 'Prof. Ramesh HOD', department: 'Computer Science' },
    { email: 'admin.demo@campus.edu', role: 'admin', full_name: 'Sports & Facilities Admin', department: 'Administration' },
    { email: 'principal@campus.edu', role: 'admin', full_name: 'Dr. Principal', department: 'Principal Office' },
    { email: 'office@campus.edu', role: 'admin', full_name: 'Campus Office', department: 'Administration' },
    { email: 'staff.demo@campus.edu', role: 'faculty', full_name: 'Support Staff / Lab Assistant', department: 'Support' }
  ]

  for (const u of demoUsers) {
    const { data: userRecord, error } = await db.auth.admin.createUser({
      email: u.email,
      password: 'DemoPassword123!',
      email_confirm: true,
      user_metadata: { full_name: u.full_name }
    })

    let userId = userRecord?.user?.id
    if (error && error.message.includes('already been registered')) {
      const { data: existingList } = await db.auth.admin.listUsers()
      userId = existingList.users.find(x => x.email === u.email)?.id
    }

    if (userId) {
      await db.from('profiles').upsert({
        id: userId,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        department: u.department || null,
        club: u.club || null,
        no_show_count: 0
      })
      console.log(`✓ Configured profile: ${u.email} [${u.role}]`)
    }
  }

  console.log('✅ Specific campus facilities seeded successfully.')
}

seed().catch(err => {
  console.error('Seed error:', err)
  process.exit(1)
})
