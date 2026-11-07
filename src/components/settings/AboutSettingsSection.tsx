import { invoke } from "../../platform";
import { toast } from "sonner";
import { version } from "../../../package.json";
import { Button } from "../ui";
import { GithubIcon } from "../icons";

export function AboutSettingsSection() {
  const handleOpenUrl = async (url: string) => {
    try {
      await invoke("open_url_safe", { url });
    } catch (err) {
      console.error("Failed to open URL:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open URL");
    }
  };

  return (
    <div className="space-y-8 py-8">
      {/* Version */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Version</h2>
        <p className="text-sm text-text-muted mb-4">
          You are currently using Scratch v{version}
        </p>
      </section>

      {/* Divider */}
      <div className="border-t border-border border-dashed" />

      {/* About Section */}
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-1">About Scratch</h2>
        <p className="text-sm text-text-muted mb-4">
          Scratch is a minimalist, local-first markdown note-taking app. Notes
          are plain <code className="text-xs">.md</code> files you own, organized
          by notebook, status, and tag. The interface runs as a PWA, backed by a
          local Node server that owns your notes folder, search, Git, and file
          watching. It stays offline-first and open source, with no cloud, no
          accounts, and no subscriptions. Learn more on{" "}
          <button
            onClick={() => handleOpenUrl("https://www.ericli.io/scratch")}
            className="text-text-muted border-b border-text-muted/50 hover:text-text hover:border-text cursor-pointer transition-colors"
          >
            our website
          </button>
          .
        </p>
        <div className="flex items-center gap-1">
          <Button
            onClick={() => handleOpenUrl("https://github.com/erictli/scratch")}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <GithubIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            View on GitHub
          </Button>
          <Button
            onClick={() =>
              handleOpenUrl("https://github.com/erictli/scratch/issues")
            }
            variant="ghost"
            size="md"
            className="gap-1.25 text-text"
          >
            Submit Feedback
          </Button>
        </div>
      </section>
    </div>
  );
}
