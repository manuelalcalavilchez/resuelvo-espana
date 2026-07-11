with open("/etc/default/grub") as f:
    lines = f.readlines()
out = []
for l in lines:
    if l.startswith("GRUB_CMDLINE_LINUX=") and "DEFAULT" not in l:
        l = 'GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"\n'
    out.append(l)
with open("/etc/default/grub","w") as f:
    f.writelines(out)
print("OK")
