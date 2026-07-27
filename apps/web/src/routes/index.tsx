import { createFileRoute } from "@tanstack/react-router";
import { TabeloApp } from "@/ui/tabelo-app";

export const Route = createFileRoute("/")({
	component: TabeloApp,
});
