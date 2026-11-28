/**
 * Generates terminal output for commands based on type and success.
 */

const BAR_FULL = '#'.repeat(20);

export function generateOutput(command, type, isSuccess) {
  if (!isSuccess) {
    return [
      `> ${command}`,
      '  ERROR: Command does not match.',
    ];
  }

  const output = [`> ${command}`];

  if (type === 'real') {
    if (command === 'scan logs') {
      output.push('  drwx  auth.log      1.2K');
      output.push('  drwx  sys.log       4.8K');
      output.push('  key.bin found.');
    } else if (command === 'start sequence') {
      output.push('  alpha > beta > gamma');
      output.push('  Sequence ready.');
    } else if (command === 'read token') {
      output.push('  ** CORE_TOKEN: X79-ALPHA-OMEGA');
      output.push('  ** Verified: 0xA77F checksum OK');
    } else if (command === 'find auth') {
      output.push('  10:42:01 AUTH_FAIL user=root  node=NX7');
      output.push('  10:42:05 AUTH_FAIL user=admin node=NX7');
      output.push('  2 matches found.');
    } else if (command === 'decode key') {
      output.push('  Key decoded: X79-BETA-OMEGA-44');
    } else if (command === 'unpack backup') {
      output.push(`  [${BAR_FULL}] 100%`);
      output.push('  Backup unpacked.');
    } else if (command === 'find keys') {
      output.push('  /mnt/secure/master.key');
      output.push('  /mnt/backup/old.key');
    } else if (command === 'erase trace' || command === 'wipe trace') {
      output.push('  Trace buffer cleared.');
    } else if (command === 'read cipher') {
      output.push('  0x4A 0x2B 0x99 0xFF');
      output.push('  Cipher fragment loaded.');
    } else if (command === 'purge intrusion log') {
      output.push('  1,204 entries purged.');
    } else if (command === 'synchronize dead keys') {
      output.push('  3/3 keys synchronized.');
    } else if (command === 'decrypt security kernel') {
      output.push('  Kernel decrypted. Integrity OK.');
    } else if (command === 'bypass firewall array') {
      output.push('  Firewall array bypassed.');
    } else if (command === 'flush memory buffer') {
      output.push('  Buffer flushed. 0 leaks.');
    } else if (command === 'isolate core process') {
      output.push('  Core process isolated.');
    } else if (command === 'sanitize audit trail') {
      output.push('  Audit trail sanitized.');
    } else {
      output.push('  Execution successful. 0 errors. Exit 0.');
    }
  } else {
    if (command === 'breach NX7') {
      output.push(`  NX7 [${BAR_FULL}] OPEN`);
    } else if (command === 'decrypt ghost') {
      output.push('  Ghost sequence decrypted.');
    } else if (command === 'reset pulse') {
      output.push('  Pulse stable: _/\\_/\\_/\\_');
    } else if (command === 'override core') {
      output.push('  CORE STATUS: UNLOCKED');
    } else if (command === 'enter mainframe') {
      output.push('  ACCESS GRANTED');
      output.push('  Welcome to the Mainframe.');
    } else if (command === 'connect core') {
      output.push('  Connected to mainframe@core.');
    } else if (command === 'hold pulse') {
      output.push('  Pulse control engaged.');
    } else if (command === 'receive 42') {
      output.push('  Key 42 received.');
    } else if (command === 'stop sequence') {
      output.push('  Sequence halted.');
    } else if (command === 'engage shroud') {
      output.push('  Shroud enabled. Visibility hidden.');
    } else if (command === 'reroute backup power') {
      output.push('  Backup power rerouted.');
    } else if (command === 'compile exploit chain') {
      output.push('  Exploit chain compiled. 0 warnings.');
    } else if (command === 'inject override token') {
      output.push('  Override token injected.');
    } else {
      output.push('  ** Command accepted. Subroutine executed.');
    }
  }

  return output;
}
