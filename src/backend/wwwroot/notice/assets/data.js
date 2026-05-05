// In-memory mock data used by all pages. No real customer data.
window.MOCK = {
  notices: [
    {
      id: 'N-1001',
      entity: 'Entity A',
      jurisdiction: 'CA - State',
      taxType: 'Sales Tax',
      noticeDate: '2026-04-12',
      dueDate: '2026-05-15',
      amountDue: 4820.50,
      currency: 'USD',
      urgency: 'high',
      actionRequired: true,
      status: 'Open',
      assignedTo: 'Alex Chen',
      summary: 'Underpayment notice for Q1 sales tax. Response required by due date.',
      attachments: [
        { name: 'original-notice.pdf', kind: 'notice' },
        { name: 'q1-return.pdf', kind: 'correspondence' }
      ]
    },
    {
      id: 'N-1002',
      entity: 'Entity B',
      jurisdiction: 'NY - City',
      taxType: 'Property Tax',
      noticeDate: '2026-04-18',
      dueDate: '2026-06-01',
      amountDue: 12300.00,
      currency: 'USD',
      urgency: 'medium',
      actionRequired: true,
      status: 'In Review',
      assignedTo: 'Priya Patel',
      summary: 'Reassessment of property valuation. Appeal window 30 days.',
      attachments: [{ name: 'reassessment.pdf', kind: 'notice' }]
    },
    {
      id: 'N-1003',
      entity: 'Entity C',
      jurisdiction: 'TX - State',
      taxType: 'Franchise Tax',
      noticeDate: '2026-03-30',
      dueDate: null,
      amountDue: 0,
      currency: 'USD',
      urgency: 'low',
      actionRequired: false,
      status: 'Closed',
      assignedTo: 'Jordan Lee',
      summary: 'Informational notice confirming receipt of franchise filing.',
      attachments: [{ name: 'confirmation.pdf', kind: 'notice' }]
    },
    {
      id: 'N-1004',
      entity: 'Entity D',
      jurisdiction: 'WA - State',
      taxType: 'Use Tax',
      noticeDate: '2026-04-22',
      dueDate: '2026-05-22',
      amountDue: 1675.25,
      currency: 'USD',
      urgency: 'medium',
      actionRequired: true,
      status: 'Open',
      assignedTo: 'Alex Chen',
      summary: 'Audit adjustment for use tax on equipment purchases.',
      attachments: [{ name: 'audit-adjustment.pdf', kind: 'notice' }]
    },
    {
      id: 'N-1005',
      entity: 'Entity E',
      jurisdiction: 'IL - State',
      taxType: 'Income Tax',
      noticeDate: '2026-04-25',
      dueDate: '2026-05-30',
      amountDue: 8900.00,
      currency: 'USD',
      urgency: 'high',
      actionRequired: true,
      status: 'Open',
      assignedTo: 'Sam Rivera',
      summary: 'Discrepancy between filed return and reported W-2 amounts.',
      attachments: []
    }
  ],
  rules: [
    { id: 'R-01', taxType: 'Sales Tax', jurisdiction: 'Any', assignTo: 'Alex Chen', notify: 'sales-team@example.com', reminderDays: 7 },
    { id: 'R-02', taxType: 'Property Tax', jurisdiction: 'Any', assignTo: 'Priya Patel', notify: 'property-team@example.com', reminderDays: 14 },
    { id: 'R-03', taxType: 'Income Tax', jurisdiction: 'Any', assignTo: 'Sam Rivera', notify: 'income-team@example.com', reminderDays: 5 }
  ]
};
