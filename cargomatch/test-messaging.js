/**
 * Messaging System Test Script
 * Run this in the browser console to test messaging functionality
 * 
 * Usage:
 * 1. Open your CargoMatch app in the browser
 * 2. Login as a user
 * 3. Open browser DevTools (F12)
 * 4. Copy and paste this entire script into the console
 * 5. Press Enter to run
 * 6. Check the results
 */

(async function testMessagingSystem() {
  console.log('🧪 Starting Messaging System Test...\n');

  // Check if we're in the right app
  if (typeof supabase === 'undefined') {
    console.error('❌ Supabase client not found. Make sure you\'re on the CargoMatch app page.');
    return;
  }

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function logTest(name, passed, message) {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}: ${message}`);
    results.tests.push({ name, passed, message });
    if (passed) results.passed++;
    else results.failed++;
  }

  // Test 1: Check if user is authenticated
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user) {
      logTest('Authentication', true, `User authenticated as ${user.email}`);
    } else {
      logTest('Authentication', false, 'No user logged in');
      console.log('\n⚠️  Please log in to continue tests\n');
      return;
    }
  } catch (err) {
    logTest('Authentication', false, err.message);
    return;
  }

  // Test 2: Check messages table access
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    if (error) {
      logTest('Messages Table Access', false, error.message);
    } else {
      logTest('Messages Table Access', true, 'Can read messages table');
    }
  } catch (err) {
    logTest('Messages Table Access', false, err.message);
  }

  // Test 3: Check notifications table access
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);
    
    if (error) {
      logTest('Notifications Table Access', false, error.message);
    } else {
      logTest('Notifications Table Access', true, 'Can read notifications table');
    }
  } catch (err) {
    logTest('Notifications Table Access', false, err.message);
  }

  // Test 4: Check support_threads table exists
  try {
    const { data, error } = await supabase
      .from('support_threads')
      .select('id')
      .limit(1);
    
    if (error) {
      logTest('Support Threads Table', false, error.message);
    } else {
      logTest('Support Threads Table', true, 'Support threads table exists');
    }
  } catch (err) {
    logTest('Support Threads Table', false, err.message);
  }

  // Test 5: Check support_messages table exists
  try {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id')
      .limit(1);
    
    if (error) {
      logTest('Support Messages Table', false, error.message);
    } else {
      logTest('Support Messages Table', true, 'Support messages table exists');
    }
  } catch (err) {
    logTest('Support Messages Table', false, err.message);
  }

  // Test 6: Check if can create support thread
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: existingThread } = await supabase
      .from('support_threads')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingThread) {
      logTest('Support Thread Creation', true, 'Support thread already exists - ready to use');
    } else {
      // Try to create one
      const { data, error } = await supabase
        .from('support_threads')
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (error) {
        logTest('Support Thread Creation', false, error.message);
      } else {
        logTest('Support Thread Creation', true, 'Created new support thread successfully');
      }
    }
  } catch (err) {
    logTest('Support Thread Creation', false, err.message);
  }

  // Test 7: Check shipments for messaging
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    const { data: carrier } = await supabase
      .from('carriers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    let orFilter = `shipper_id.eq.${user.id}`;
    if (carrier) orFilter += `,carrier_id.eq.${carrier.id}`;

    const { data: shipments, error } = await supabase
      .from('shipments')
      .select('id, reference')
      .or(orFilter)
      .limit(5);

    if (error) {
      logTest('Shipments Access', false, error.message);
    } else {
      logTest('Shipments Access', true, `Found ${shipments?.length || 0} shipments for messaging`);
      if (shipments && shipments.length > 0) {
        console.log('  📦 Shipment references:', shipments.map(s => s.reference).join(', '));
      }
    }
  } catch (err) {
    logTest('Shipments Access', false, err.message);
  }

  // Test 8: Check realtime connection
  try {
    const channelTest = supabase.channel('test-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, () => {})
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logTest('Realtime Connection', true, 'Realtime subscription working');
          channelTest.unsubscribe();
        } else if (status === 'CHANNEL_ERROR') {
          logTest('Realtime Connection', false, 'Failed to subscribe to realtime');
        }
      });

    // Give it a moment to connect
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (err) {
    logTest('Realtime Connection', false, err.message);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(50) + '\n');

  if (results.failed === 0) {
    console.log('🎉 All tests passed! Your messaging system is ready to use.\n');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above and:');
    console.log('   1. Make sure you ran MESSAGING_COMPLETE_FIX.sql in Supabase');
    console.log('   2. Verify you\'re logged in as a valid user');
    console.log('   3. Check your internet connection');
    console.log('   4. Review the MESSAGING_FIX_README.md for troubleshooting\n');
  }

  // Return results for further inspection
  return results;
})();
