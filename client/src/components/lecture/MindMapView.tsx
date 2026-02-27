import React, { useEffect, useState, useMemo } from "react";
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Node,
    Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Button } from "@/components/ui/button";
import { BrainCircuit, ChevronRight, ChevronLeft, Map, Compass } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface MindMapViewProps {
    mindmapCode: string;
}

interface GuideNode {
    node: string;
    explanation: string;
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = 'top' as any;
        node.sourcePosition = 'bottom' as any;
        node.position = {
            x: nodeWithPosition.x - NODE_WIDTH / 2,
            y: nodeWithPosition.y - NODE_HEIGHT / 2,
        };
    });

    return { nodes, edges };
};

export function MindMapView({ mindmapCode }: MindMapViewProps) {
    const { language, isRTL } = useLanguage();

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const [guide, setGuide] = useState<GuideNode[]>([]);
    const [isInteractive, setIsInteractive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [parseError, setParseError] = useState(false);

    useEffect(() => {
        if (!mindmapCode) return;

        try {
            const parsed = JSON.parse(mindmapCode);

            let initialNodes: Node[] = (parsed.nodes || []).map((n: any) => ({
                id: String(n.id),
                data: { label: n.label || "Unnamed Concept" },
                position: { x: 0, y: 0 },
                style: {
                    background: '#f9f9f9',
                    border: '2px solid #bbf',
                    borderRadius: '8px',
                    padding: '10px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    textAlign: 'center',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                },
            }));

            if (initialNodes.length === 0) {
                if (parsed.mermaid) {
                    throw new Error("OLD_FORMAT");
                } else {
                    throw new Error("NO_NODES");
                }
            }

            let initialEdges: Edge[] = (parsed.edges || []).map((e: any) => ({
                id: String(e.id || `${e.source}-${e.target}`),
                source: String(e.source),
                target: String(e.target),
                label: e.label || undefined,
                animated: true,
                style: { stroke: '#A78BFA', strokeWidth: 2 },
                labelStyle: { fill: '#333', fontWeight: 'bold' },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#A78BFA',
                },
            }));

            // Make the first node look like the "root" (Pink border)
            if (initialNodes.length > 0) {
                initialNodes[0].style = {
                    ...initialNodes[0].style,
                    border: '2px solid #f9f',
                    background: '#fff0ff',
                };
            }

            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                initialNodes,
                initialEdges
            );

            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

            if (parsed.interactiveGuide && Array.isArray(parsed.interactiveGuide)) {
                setGuide(parsed.interactiveGuide);
            }

            setParseError(false);
        } catch (e) {
            console.error("Failed to parse map data:", e);
            setParseError(true);
        }
    }, [mindmapCode]);

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, guide.length - 1));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    if (parseError) {
        return (
            <div className="w-full min-h-[400px] flex items-center justify-center border-2 border-dashed border-destructive/50 rounded-xl bg-destructive/5 p-8 text-center flex-col">
                <BrainCircuit className="w-12 h-12 text-destructive/50 mb-4 animate-pulse" />
                <h4 className="text-lg font-bold text-destructive mb-2">
                    {language === 'ar' ? 'حدث خطأ أثناء تحميل الخريطة' : 'Error rendering Concept Map'}
                </h4>
                <p className="text-muted-foreground text-sm max-w-lg mb-4">
                    {language === 'ar' ? 'نمط البيانات غير متوافق. يرجى مسح السجل وإعادة المحاولة.' : 'Data syntax incompatible. Please clear log and retry.'}
                </p>
            </div>
        );
    }

    return (
        <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={cn("flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", isRTL ? "sm:flex-row-reverse" : "")}>
                <div className={cn("flex items-center gap-2", isRTL ? "flex-row-reverse" : "")}>
                    <BrainCircuit className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">
                        {language === 'ar' ? 'الخريطة المفاهيمية' : 'Concept Map'}
                    </h3>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {guide.length > 0 && (
                        <Button
                            variant={isInteractive ? "default" : "secondary"}
                            size="sm"
                            onClick={() => setIsInteractive(!isInteractive)}
                            className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:opacity-90 transition-opacity"
                        >
                            {isInteractive ? <Map className="w-4 h-4 mr-2" /> : <Compass className="w-4 h-4 mr-2" />}
                            {language === 'ar' ? (isInteractive ? 'إيقاف الشرح التفصيلي' : 'جولة تفصيلية') : (isInteractive ? 'Exit Tour' : 'Interactive Tour')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="relative w-full rounded-xl border bg-card/50 overflow-hidden shadow-sm h-[600px] flex flex-col">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    attributionPosition="bottom-left"
                    nodesConnectable={false}
                    nodesDraggable={true}
                >
                    <Background color="#ccc" gap={16} />
                    <Controls />
                    <MiniMap zoomable pannable nodeColor={(n) => {
                        if (n.style?.background) return n.style.background as string;
                        return '#eee';
                    }} />
                </ReactFlow>

                {/* Interactive Player Mode Float */}
                {isInteractive && guide.length > 0 && (
                    <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom border rounded-xl bg-background/95 backdrop-blur shadow-lg p-4 md:p-6 mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-semibold text-primary/80 uppercase tracking-widest">
                                {language === 'ar' ? 'الشرح التفاعلي' : 'Guided Context'} ({currentStep + 1} / {guide.length})
                            </span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={prevStep} disabled={currentStep === 0}>
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="default" onClick={nextStep} disabled={currentStep === guide.length - 1}>
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <h4 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600 mb-2">
                            {guide[currentStep].node}
                        </h4>
                        <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                            {guide[currentStep].explanation}
                        </p>

                        <div className="w-full h-1 bg-secondary mt-4 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${((currentStep + 1) / guide.length) * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
